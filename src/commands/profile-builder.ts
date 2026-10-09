import { confirm, input, select } from "@inquirer/prompts";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { readGlobalGitIdentity } from "../core/git-config";
import { discoverPublicKeys, generateKey } from "../core/ssh-keygen";
import { defaultKeyName, defaultProfileName, getHostTemplate, hostTemplateChoices, type HostTemplate } from "../utils/host";
import type { Profile } from "../types";
import { sshDir } from "../utils/paths";

interface ProfileAddOptions {
  template?: string;
  name?: string;
  host?: string;
  hostname?: string;
  user?: string;
  account?: string;
  identityFile?: string;
  publicKeyFile?: string;
  fingerprint?: string;
  generateKey?: boolean;
  gitName?: string;
  gitEmail?: string;
}

export function expandKeyPath(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : resolve(path);
}

export async function buildProfile(options: ProfileAddOptions): Promise<Profile> {
  const template = options.template ? getHostTemplate(options.template) : await promptHostTemplate();
  const account = options.account ?? await input({ message: "Platform account (not your commit author name)", required: true });
  const hostname = options.hostname ?? options.host ?? template?.hostname ?? await input({
    message: "Git SSH hostname (e.g. git.company.com)", required: true,
    validate: (value) => /^[a-z\d][a-z\d.-]*$/i.test(value) || "Enter a hostname without a URL or port.",
  });
  const host = options.host ?? template?.host ?? hostname;
  const user = options.user ?? template?.user ?? await input({ message: "SSH login user", default: "git", required: true });
  const name = options.name ?? defaultProfileName(host, account);
  const defaults = options.gitName && options.gitEmail ? {} : await readGlobalGitIdentity();
  const gitName = options.gitName ?? await input({ message: "Commit author name", default: defaults.name ?? account, required: true });
  const gitEmail = options.gitEmail ?? await input({ message: "Commit author email", ...(defaults.email ? { default: defaults.email } : {}), required: true });
  const selectedKey = await resolveKey({ ...options, defaultIdentityFile: join(sshDir(), defaultKeyName(name)), comment: `${account}@${hostname}` });
  return {
    name, host, hostname, user, account,
    identity_file: selectedKey.identityFile,
    public_key_file: selectedKey.publicKeyFile,
    fingerprint: selectedKey.fingerprint,
    git_name: gitName, git_email: gitEmail,
  };
}

export async function editProfile(existing: Profile): Promise<Profile> {
  const profile = { ...existing };
  while (true) {
    const field = await select({
      message: `Edit ${profile.name}`,
      choices: [
        { name: `Commit name: ${profile.git_name ?? "(missing)"}`, value: "git_name" },
        { name: `Commit email: ${profile.git_email ?? "(missing)"}`, value: "git_email" },
        { name: `Platform hostname: ${profile.hostname}`, value: "hostname" },
        { name: `Git host / alias: ${profile.host}`, value: "host" },
        { name: `Platform account: ${profile.account}`, value: "account" },
        { name: `SSH user: ${profile.user}`, value: "user" },
        { name: `SSH key: ${profile.identity_file}`, value: "key" },
        { name: "Save changes", value: "save" },
      ],
    });
    if (field === "save") {
      if (!profile.git_name || !profile.git_email) {
        console.log("Set a commit author name and email before saving.");
        continue;
      }
      return profile;
    }
    if (field === "key") {
      const selected = await resolveKey({ defaultIdentityFile: join(sshDir(), defaultKeyName(profile.name)), comment: `${profile.account}@${profile.hostname}` });
      profile.identity_file = selected.identityFile;
      profile.public_key_file = selected.publicKeyFile;
      profile.fingerprint = selected.fingerprint;
    } else {
      const key = field as "git_name" | "git_email" | "hostname" | "host" | "account" | "user";
      const value = await input({ message: key, default: profile[key] ?? "", required: true });
      if (key === "hostname" && profile.host === profile.hostname) profile.host = value;
      profile[key] = value;
    }
  }
}

interface ResolveKeyOptions {
  identityFile?: string;
  publicKeyFile?: string;
  fingerprint?: string;
  generateKey?: boolean;
  defaultIdentityFile: string;
  comment: string;
}

interface ResolvedKey {
  identityFile: string;
  publicKeyFile: string;
  fingerprint: string;
}

async function resolveKey(options: ResolveKeyOptions): Promise<ResolvedKey> {
  if (options.identityFile) {
    return {
      identityFile: expandKeyPath(options.identityFile),
      publicKeyFile: expandKeyPath(options.publicKeyFile ?? `${options.identityFile}.pub`),
      fingerprint: options.fingerprint ?? "",
    };
  }
  const keys = await discoverPublicKeys();
  const choice = options.generateKey !== undefined ? (options.generateKey ? "new" : "existing") : await select({
    message: "SSH key",
    choices: [
      ...keys.map((key) => ({ name: `Use ${key.identity_file} ${key.comment}`, value: key.identity_file })),
      { name: "Generate a new key", value: "new" },
      { name: "Use a key at another path", value: "path" },
    ],
  });
  if (choice === "new") {
    const identityFile = expandKeyPath(await input({ message: "New key path", default: options.defaultIdentityFile, required: true }));
    await generateKey({ identityFile, comment: options.comment, passphrase: "" });
    const generated = (await discoverPublicKeys()).find((key) => key.identity_file === identityFile);
    return { identityFile, publicKeyFile: `${identityFile}.pub`, fingerprint: generated?.fingerprint ?? "" };
  }
  if (choice === "path") {
    const identityFile = expandKeyPath(await input({ message: "Existing private key path (only the .pub file is read)", required: true }));
    return { identityFile, publicKeyFile: `${identityFile}.pub`, fingerprint: "" };
  }
  const selected = choice === "existing" ? await select<string>({
    message: "Choose an SSH key", choices: keys.map((key) => ({ name: key.identity_file, value: key.identity_file })),
  }) : choice;
  const key = keys.find((item) => item.identity_file === selected);
  if (!key) throw new Error("No existing public key found. Choose a new key or specify its path.");
  return { identityFile: key.identity_file, publicKeyFile: key.public_key_file, fingerprint: key.fingerprint };
}

async function shouldGenerateKey(): Promise<boolean> {
  return confirm({ message: "Generate a new SSH key for this profile?", default: true });
}

async function promptHostTemplate(): Promise<HostTemplate | undefined> {
  const choice = await select<string>({
    message: "Choose a Git platform",
    choices: [...hostTemplateChoices().map((template) => ({ name: template.label, value: template.host })), { name: "Other / self-hosted", value: "__custom__" }],
  });
  return hostTemplateChoices().find((template) => template.host === choice);
}
