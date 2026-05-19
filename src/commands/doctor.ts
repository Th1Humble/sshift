import chalk from "chalk";
import {
  diagnoseRepoFromRemote,
  parseResolvedIdentityFiles,
  parseSshAuthResult,
} from "../core/doctor";
import { readGlobalGitIdentity, readLocalGitIdentity } from "../core/git-config";
import { loadProfiles } from "../core/profiles";
import { formatKeyValue, statusError, statusOk, statusWarning } from "../utils/output";
import { runCommand } from "../utils/shell";

export async function doctorCommand(): Promise<void> {
  const store = await loadProfiles();
  const remote = await runCommand("git", ["remote", "get-url", "origin"]);

  if (remote.exitCode !== 0) {
    console.log("Not in a Git repository with an origin remote.");
    console.log(`Configured profiles: ${store.profiles.length}`);
    return;
  }

  const remoteUrl = remote.stdout.trim();
  const diagnosis = diagnoseRepoFromRemote(remoteUrl, store.profiles);
  const [globalGitIdentity, localGitIdentity] = await Promise.all([
    readGlobalGitIdentity(),
    readLocalGitIdentity(),
  ]);

  console.log(chalk.bold("Repository"));
  console.log(formatKeyValue("origin", remoteUrl));
  console.log(formatKeyValue("Git host", diagnosis.remote_host ?? "(not an SSH remote)"));
  console.log("");

  console.log(chalk.bold("Matched Profile"));
  if (!diagnosis.profile) {
    console.log("  none");
    return;
  }

  console.log(formatKeyValue("name", diagnosis.profile.name));
  console.log(formatKeyValue("key", diagnosis.profile.identity_file));
  console.log(formatKeyValue("git", `${diagnosis.profile.git_name ?? "(unset)"} <${diagnosis.profile.git_email ?? "(unset)"}>`));
  console.log("");

  console.log(chalk.bold("Git Identity"));
  console.log(formatKeyValue("local", `${localGitIdentity.name ?? "(unset)"} <${localGitIdentity.email ?? "(unset)"}>`));
  console.log(formatKeyValue("global", `${globalGitIdentity.name ?? "(unset)"} <${globalGitIdentity.email ?? "(unset)"}>`));
  if (
    diagnosis.profile.git_email &&
    localGitIdentity.email &&
    diagnosis.profile.git_email !== localGitIdentity.email
  ) {
    console.log(
      statusWarning(`warning: local Git email does not match profile. Run: sshift bind ${diagnosis.profile.name}`),
    );
  }
  console.log("");

  const resolved = await runCommand("ssh", ["-G", diagnosis.profile.host]);
  const identityFiles = parseResolvedIdentityFiles(resolved.stdout);
  console.log(chalk.bold("OpenSSH Resolution"));
  if (identityFiles.length === 0) {
    console.log(formatKeyValue("identityfile", "(none reported)"));
  } else {
    for (const identityFile of identityFiles) {
      console.log(formatKeyValue("identityfile", identityFile));
    }
  }
  if (!identityFiles.includes(diagnosis.profile.identity_file)) {
    console.log(
      statusWarning(`warning: OpenSSH did not report the profile key. Check unmanaged Host blocks for ${diagnosis.profile.host}.`),
    );
  }
  console.log("");

  const auth = await runCommand("ssh", ["-T", `${diagnosis.profile.user}@${diagnosis.profile.host}`]);
  const authResult = parseSshAuthResult({
    host: diagnosis.profile.host,
    exitCode: auth.exitCode,
    stdout: auth.stdout,
    stderr: auth.stderr,
  });

  console.log(chalk.bold("SSH Auth"));
  console.log(`${authResult.ok ? statusOk("ok") : statusError("failed")}: ${authResult.message}`);
}
