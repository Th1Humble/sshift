import { confirm, input, select } from "@inquirer/prompts";
import { discoverPublicKeys, generateKey } from "../core/ssh-keygen";
import {
  defaultKeyName,
  defaultProfileName,
  getHostTemplate,
  hostTemplateChoices,
  type HostTemplate,
} from "../utils/host";
import type { Profile } from "../types";
import { sshDir } from "../utils/paths";
import { join } from "node:path";

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
}

export async function buildProfile(options: ProfileAddOptions): Promise<Profile> {
  const template = options.template ? getHostTemplate(options.template) : await promptHostTemplate();
  const account =
    options.account ??
    (await input({ message: "Account name", required: true }));
  const hostname =
    options.hostname ??
    options.host ??
    template?.hostname ??
    (await input({ message: "Git SSH hostname", required: true }));
  const host = options.host ?? template?.host ?? hostname;
  const user = options.user ?? template?.user ?? "git";
  const name = options.name ?? defaultProfileName(host, account);
  const hostLabel = template?.host ?? host;
  const keyComment = `${account}@${hostLabel}`;
  const defaultIdentityFile = join(sshDir(), defaultKeyName(host));
  const keyOptions: ResolveKeyOptions = {
    defaultIdentityFile,
    comment: keyComment,
  };
  if (options.identityFile) {
    keyOptions.identityFile = options.identityFile;
  }
  if (options.publicKeyFile) {
    keyOptions.publicKeyFile = options.publicKeyFile;
  }
  if (options.fingerprint) {
    keyOptions.fingerprint = options.fingerprint;
  }
  if (options.generateKey !== undefined) {
    keyOptions.generateKey = options.generateKey;
  }
  const selectedKey = await resolveKey(keyOptions);

  return {
    name,
    host,
    hostname,
    user,
    account,
    identity_file: selectedKey.identityFile,
    public_key_file: selectedKey.publicKeyFile,
    fingerprint: selectedKey.fingerprint,
  };
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
      identityFile: options.identityFile,
      publicKeyFile: options.publicKeyFile ?? `${options.identityFile}.pub`,
      fingerprint: options.fingerprint ?? "",
    };
  }

  if (options.generateKey ?? (await shouldGenerateKey())) {
    await generateKey({
      identityFile: options.defaultIdentityFile,
      comment: options.comment,
      passphrase: "",
    });
    const keys = await discoverPublicKeys();
    const generated = keys.find((key) => key.identity_file === options.defaultIdentityFile);

    return {
      identityFile: options.defaultIdentityFile,
      publicKeyFile: `${options.defaultIdentityFile}.pub`,
      fingerprint: generated?.fingerprint ?? "",
    };
  }

  const keys = await discoverPublicKeys();
  if (keys.length === 0) {
    throw new Error("No public keys found. Re-run with --generate-key or create a key first.");
  }

  const selectedIdentityFile = await select<string>({
    message: "Choose an SSH key",
    choices: keys.map((key) => ({
      name: `${key.identity_file} ${key.fingerprint} ${key.comment}`,
      value: key.identity_file,
    })),
  });
  const selected = keys.find((key) => key.identity_file === selectedIdentityFile);
  if (!selected) {
    throw new Error(`Selected key not found: ${selectedIdentityFile}`);
  }

  return {
    identityFile: selected.identity_file,
    publicKeyFile: selected.public_key_file,
    fingerprint: selected.fingerprint,
  };
}

async function shouldGenerateKey(): Promise<boolean> {
  return confirm({
    message: "Generate a new SSH key for this profile?",
    default: true,
  });
}

async function promptHostTemplate(): Promise<HostTemplate | undefined> {
  const custom = "__custom__";
  const choice = await select<string>({
    message: "Choose a Git host template",
    choices: [
      ...hostTemplateChoices().map((template) => ({
        name: template.label,
        value: template.host,
      })),
      { name: "Custom host", value: custom },
    ],
  });
  if (choice === custom) {
    return undefined;
  }
  return hostTemplateChoices().find((template) => template.host === choice);
}
