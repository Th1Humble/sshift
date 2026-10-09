import { confirm, input, select } from "@inquirer/prompts";
import { readFile, stat } from "node:fs/promises";
import { loadProfiles } from "../core/profiles";
import { parseFingerprintOutput } from "../core/ssh-keygen";
import { readOptionalFile, requireIdentityGit, saveAndApplyProfiles, validateProfiles } from "../core/identity-config";
import { detectUnmanagedHostConflicts } from "../core/ssh-config";
import { diagnoseRepoFromRemote, parseGitSshHost } from "../core/doctor";
import { readCommitIdentity, readEffectiveGitIdentity, repairRepositoryIdentity } from "../core/git-config";
import { formatKeyValue, label, statusOk } from "../utils/output";
import { sshConfigPath } from "../utils/paths";
import { runCommand } from "../utils/shell";
import type { Profile } from "../types";
import { buildProfile, editProfile, expandKeyPath } from "./profile-builder";
import { printProfilesTable } from "./profile-list";

interface AddOptions { yes?: boolean; edit?: string; }

export async function addCommand(options: AddOptions): Promise<void> {
  await requireIdentityGit();
  const store = await loadProfiles();
  const existing = options.edit ? store.profiles.find((profile) => profile.name === options.edit) : undefined;
  if (options.edit && !existing) throw new Error(`Identity not found: ${options.edit}. Run sshift list.`);
  if (store.profiles.length) printProfilesTable(store.profiles);
  const profile = existing ? await editProfile(existing) : await buildProfile({});
  const others = store.profiles.filter((item) => item.name !== existing?.name);
  const sshConfig = await readOptionalFile(sshConfigPath()) ?? "";
  if (others.some((item) => item.host === profile.host)) {
    console.log(`${profile.host} already has an identity. This account needs its own SSH alias.`);
    profile.host = await promptAlias(profile, others);
  } else if ((!existing || existing.host !== profile.host) && detectUnmanagedHostConflicts(sshConfig, [profile]).length) {
    const choice = await select({
      message: `Existing SSH settings for ${profile.host} found`,
      choices: [
        { name: "Keep existing routing and use a separate alias", value: "alias" },
        { name: "Use the selected key for this host (preserve existing config text)", value: "host" },
      ],
    });
    if (choice === "alias") profile.host = await promptAlias(profile, others);
  }
  const profiles = existing ? store.profiles.map((item) => item.name === existing.name ? profile : item) : [...store.profiles, profile];
  validateProfiles(profiles);
  profile.identity_file = expandKeyPath(profile.identity_file);
  profile.public_key_file = expandKeyPath(profile.public_key_file);
  if (!(await stat(profile.identity_file)).isFile()) throw new Error("The selected private key path is not a file.");
  const publicKey = await readFile(profile.public_key_file, "utf8");
  if (!publicKey.trim()) throw new Error("The selected public key is empty.");
  const keyInfo = await runCommand("ssh-keygen", ["-lf", profile.public_key_file]);
  if (keyInfo.exitCode !== 0) throw new Error(`Invalid SSH public key: ${profile.public_key_file}`);
  profile.fingerprint = parseFingerprintOutput(keyInfo.stdout).fingerprint;
  console.log(formatKeyValue("Identity", profile.name));
  console.log(formatKeyValue("Git host", profile.host));
  console.log(formatKeyValue("Commit author", `${profile.git_name} <${profile.git_email}>`));
  console.log(formatKeyValue("Key", profile.identity_file));
  if (!existing || existing.public_key_file !== profile.public_key_file) {
    console.log(label("Register this public key on your platform:"));
    console.log(publicKey.trim());
    if (profile.hostname === "github.com") console.log("https://github.com/settings/ssh/new");
    else if (profile.hostname === "gitlab.com") console.log("https://gitlab.com/-/user_settings/ssh_keys");
    else console.log(`Open the SSH key settings on ${profile.hostname}.`);
  }
  if (!(options.yes ?? await confirm({ message: "Save and activate this identity?", default: true }))) {
    console.log("Cancelled. SSH and Git configuration were not changed.");
    return;
  }
  await saveAndApplyProfiles(profiles, existing ? `edit ${profile.name}` : `add ${profile.name}`);
  console.log(statusOk(`Identity ${existing ? "updated" : "added"}. SSH key and Git author routing are active.`));
  if (profile.host !== profile.hostname) console.log(`Use SSH clone URLs with ${profile.host}: ${profile.user}@${profile.host}:owner/repo.git`);
  const remote = await runCommand("git", ["remote", "get-url", "origin"]);
  if (remote.exitCode === 0) {
    const url = remote.stdout.trim();
    const matched = diagnoseRepoFromRemote(url, [profile]).profile;
    const host = diagnoseRepoFromRemote(url, []).remote_host;
    const effective = await readEffectiveGitIdentity();
    const needsAlias = !!parseGitSshHost(url) && ((profile.host !== profile.hostname && host === profile.hostname) || (existing && host === existing.host && existing.host !== profile.host));
    if (needsAlias || (matched && (effective.name !== profile.git_name || effective.email !== profile.git_email))) {
      if (await confirm({ message: "Use this identity in the current repository? This updates the SSH alias if needed and clears local author overrides.", default: true })) {
        await repairRepositoryIdentity(profile, url);
        const author = await readCommitIdentity("AUTHOR");
        if (author.name === profile.git_name && author.email === profile.git_email) console.log(statusOk("Current repository now follows the automatic identity rules."));
        else console.log("Another Git include or environment override still controls the commit author. Run sshift doctor to inspect its source.");
      }
    }
  }
  console.log("Run sshift doctor inside a repository to verify the actual key and commit author.");
}

async function promptAlias(profile: Profile, others: Profile[]): Promise<string> {
  return input({
    message: "SSH alias for this account",
    default: `${profile.hostname}-${profile.account.toLowerCase().replace(/[^a-z\d]+/g, "-")}`,
    required: true,
    validate: (value) => /^[a-z\d][a-z\d.-]*$/i.test(value) && !others.some((item) => item.host === value) && value !== profile.hostname || "Choose a unique alias different from the platform hostname.",
  });
}
