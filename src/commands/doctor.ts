import chalk from "chalk";
import { confirm, select } from "@inquirer/prompts";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { diagnoseRepoFromRemote, parseGitSshHost, parseResolvedIdentityFiles, parseSshAuthResult } from "../core/doctor";
import { readCommitIdentity, readEffectiveGitIdentity, readGlobalGitIdentity, readLocalGitIdentity, repairRepositoryIdentity } from "../core/git-config";
import { loadProfiles } from "../core/profiles";
import { requireIdentityGit, saveAndApplyProfiles } from "../core/identity-config";
import { formatKeyValue, statusError, statusOk, statusWarning } from "../utils/output";
import { runCommand } from "../utils/shell";
import type { Profile } from "../types";

interface DoctorOptions { fix?: boolean; }

export async function doctorCommand(options: DoctorOptions = {}): Promise<void> {
  const store = await loadProfiles();
  if (options.fix) {
    await requireIdentityGit();
    if (await confirm({ message: "Regenerate SSH and automatic Git author rules from saved identities?", default: true })) {
      await saveAndApplyProfiles(store.profiles, "doctor repair");
      console.log(statusOk("Managed configuration repaired."));
    }
  }
  const remote = await runCommand("git", ["remote", "get-url", "origin"]);
  if (remote.exitCode !== 0) {
    console.log("Run sshift doctor inside a repository with an origin remote.");
    console.log(`Configured identities: ${store.profiles.length}. Use sshift list to inspect them.`);
    return;
  }
  let remoteUrl = remote.stdout.trim();
  let diagnosis = diagnoseRepoFromRemote(remoteUrl, store.profiles);
  let profile = diagnosis.profile;
  if (options.fix && parseGitSshHost(remoteUrl)) {
    const candidates = store.profiles.filter((item) => item.hostname === diagnosis.remote_host || item.hostname === profile?.hostname);
    if (candidates.length > 1 || (!profile && candidates.length)) profile = await select<Profile>({
      message: "Choose the identity for this repository", choices: candidates.map((item) => ({ name: `${item.name}: ${item.git_email ?? "author missing"}`, value: item })),
      ...(profile ? { default: profile } : {}),
    });
  }
  console.log(chalk.bold("Repository"));
  console.log(formatKeyValue("origin", remoteUrl));
  console.log(formatKeyValue("Git host", diagnosis.remote_host ?? "(not a hosted remote)"));
  if (!profile) {
    console.log(statusWarning("No matching identity. Run sshift add, or sshift doctor --fix to select an existing SSH alias."));
    return;
  }
  console.log(formatKeyValue("Identity", profile.name));
  console.log(formatKeyValue("Expected author", `${profile.git_name ?? "(unset)"} <${profile.git_email ?? "(unset)"}>`));
  if (!profile.git_name || !profile.git_email) console.log(statusWarning(`Complete this identity with: sshift add --edit ${profile.name}`));
  let author = await readCommitIdentity("AUTHOR");
  let committer = await readCommitIdentity("COMMITTER");
  const mismatch = () => author.name !== profile?.git_name || author.email !== profile?.git_email || committer.name !== profile?.git_name || committer.email !== profile?.git_email;
  if (options.fix && profile.git_name && profile.git_email && (mismatch() || profile.host !== diagnosis.remote_host)) {
    if (await confirm({ message: "Use this identity here? Clear repository author overrides and update the SSH alias if needed.", default: true })) {
      await repairRepositoryIdentity(profile, remoteUrl);
      remoteUrl = (await runCommand("git", ["remote", "get-url", "origin"])).stdout.trim();
      diagnosis = diagnoseRepoFromRemote(remoteUrl, store.profiles);
      author = await readCommitIdentity("AUTHOR");
      committer = await readCommitIdentity("COMMITTER");
    }
  }
  console.log("");
  console.log(chalk.bold("Actual Commit Identity"));
  console.log(formatKeyValue("Author", `${author.name ?? "(unset)"} <${author.email ?? "(unset)"}>`));
  console.log(formatKeyValue("Committer", `${committer.name ?? "(unset)"} <${committer.email ?? "(unset)"}>`));
  if (mismatch()) {
    console.log(statusWarning("Commit identity differs from the profile. Repository settings, Git includes, or GIT_AUTHOR_*/GIT_COMMITTER_* environment variables may override it. Run sshift doctor --fix."));
    const source = await runCommand("git", ["config", "--show-origin", "--get-regexp", "^user\\.(name|email)$"]);
    if (source.stdout.trim()) console.log(source.stdout.trim());
  } else console.log(statusOk("New commits use the expected name and email."));
  const sshHost = parseGitSshHost(remoteUrl);
  if (!sshHost) {
    console.log("This remote uses HTTPS. Git author routing applies; SSH keys are used only with SSH URLs.");
    return;
  }
  const connection: string[] = [];
  let user = profile.user;
  if (remoteUrl.startsWith("ssh://")) {
    const url = new URL(remoteUrl);
    if (url.port) connection.push("-p", url.port);
    if (url.username) user = decodeURIComponent(url.username);
  } else if (remoteUrl.includes("@")) user = remoteUrl.slice(0, remoteUrl.indexOf("@"));
  const target = `${user}@${sshHost}`;
  const resolved = await runCommand("ssh", ["-G", ...connection, target]);
  const identityFiles = parseResolvedIdentityFiles(resolved.stdout);
  console.log("");
  console.log(chalk.bold("SSH Key"));
  for (const path of identityFiles) console.log(formatKeyValue("IdentityFile", path));
  const normalize = (path: string) => resolve(path.replace(/^~\//, `${homedir()}/`));
  if (!identityFiles.some((path) => normalize(path) === normalize(profile.identity_file))) {
    console.log(statusWarning("OpenSSH is not selecting the profile key. Run sshift doctor --fix."));
  } else if (identityFiles.length > 1) console.log(statusWarning("Additional SSH keys are configured for this host. Authentication below shows which account is reached; a separate alias can isolate this identity."));
  const auth = await runCommand("ssh", ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", ...connection, target], { timeoutMs: 15000 });
  const result = parseSshAuthResult({ host: profile.hostname, ...auth });
  console.log(`${result.ok ? statusOk("SSH authenticated") : statusError("SSH authentication failed")}: ${result.message}`);
  const account = result.message.match(/^Authenticated as (.+)$/)?.[1];
  if (result.ok && account && account.toLowerCase() !== profile.account.toLowerCase()) console.log(statusWarning(`SSH reached account ${account}, but this identity expects ${profile.account}. Edit the key with: sshift add --edit ${profile.name}`));
  if (!result.ok) console.log("Make sure the public key is registered on the platform. For an unknown host, first verify its host key with native SSH.");
}
