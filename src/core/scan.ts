import { readFile } from "node:fs/promises";
import type { ScanResult, SshHostEntry } from "../types";
import { loadProfiles } from "./profiles";
import { discoverPublicKeys } from "./ssh-keygen";
import { readGlobalGitIdentity } from "./git-config";
import { parseSshConfigHosts } from "./ssh-config";
export { parseSshConfigHosts } from "./ssh-config";
import { sshConfigPath, type PathContext } from "../utils/paths";
import { runCommand, type CommandRunner } from "../utils/shell";

export interface ScanOptions {
  run?: CommandRunner;
}

export async function scanEnvironment(
  ctx?: PathContext,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const runner = options.run ?? runCommand;
  const [ssh_path, git_path, public_keys, ssh_hosts, git_global_identity, profiles] =
    await Promise.all([
      which("ssh", runner),
      which("git", runner),
      discoverPublicKeys(ctx, runner),
      readSshHosts(ctx),
      readGlobalGitIdentity(runner),
      loadProfiles(ctx).then((store) => store.profiles),
    ]);

  const result: ScanResult = {
    public_keys,
    ssh_hosts,
    git_global_identity,
    profiles,
  };

  if (ssh_path) {
    result.ssh_path = ssh_path;
  }
  if (git_path) {
    result.git_path = git_path;
  }

  return result;
}

async function which(command: string, runner: CommandRunner): Promise<string | undefined> {
  const result = await runner("which", [command]);
  if (result.exitCode !== 0) {
    return undefined;
  }
  const path = result.stdout.trim();
  return path.length > 0 ? path : undefined;
}

async function readSshHosts(ctx?: PathContext): Promise<SshHostEntry[]> {
  const config = await readFile(sshConfigPath(ctx), "utf8").catch(() => "");
  return parseSshConfigHosts(config);
}
