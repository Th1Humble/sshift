import { readFile } from "node:fs/promises";
import type { ScanResult, SshHostEntry } from "../types";
import { loadProfiles } from "./profiles";
import { discoverPublicKeys } from "./ssh-keygen";
import { readGlobalGitIdentity } from "./git-config";
import { MANAGED_END, MANAGED_START } from "./ssh-config";
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

export function parseSshConfigHosts(config: string): SshHostEntry[] {
  const hosts: SshHostEntry[] = [];
  let current: SshHostEntry | undefined;
  let managed = false;

  for (const rawLine of config.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === MANAGED_START) {
      managed = true;
      continue;
    }
    if (line === MANAGED_END) {
      managed = false;
      continue;
    }
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const [keyword, ...rest] = line.split(/\s+/);
    const value = rest.join(" ");
    const normalized = keyword?.toLowerCase();

    if (normalized === "host") {
      current = { host: value, managed };
      hosts.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (normalized === "hostname") {
      current.hostname = value;
    } else if (normalized === "user") {
      current.user = value;
    } else if (normalized === "identityfile") {
      current.identity_file = value;
    }
  }

  return hosts;
}
