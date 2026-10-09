import type { GitIdentity } from "../types";
import { runCommand, type CommandRunner } from "../utils/shell";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { backupsDir, type PathContext } from "../utils/paths";
import type { Profile } from "../types";
import { parseGitSshHost } from "./doctor";
import { renderGitRouting } from "./identity-config";

const REPO_START = "# --- sshift repository identity start ---";
const REPO_END = "# --- sshift repository identity end ---";

export async function readGlobalGitIdentity(
  runner: CommandRunner = runCommand,
): Promise<GitIdentity> {
  return readGitIdentity("global", runner);
}

export async function readLocalGitIdentity(
  runner: CommandRunner = runCommand,
): Promise<GitIdentity> {
  return readGitIdentity("local", runner);
}

export async function readEffectiveGitIdentity(
  runner: CommandRunner = runCommand,
): Promise<GitIdentity> {
  return readGitIdentity(undefined, runner);
}

export async function readCommitIdentity(
  kind: "AUTHOR" | "COMMITTER",
  runner: CommandRunner = runCommand,
): Promise<GitIdentity> {
  const result = await runner("git", ["var", `GIT_${kind}_IDENT`]);
  const match = result.stdout.trim().match(/^(.*?) <([^>]*)> \d+ [+-]\d+$/);
  if (result.exitCode !== 0 || !match?.[1] || !match[2]) return {};
  return { name: match[1], email: match[2] };
}

export function replaceRemoteHost(remote: string, host: string): string {
  if (/^(?:[^/@:]+@)?[^/:]+:(?!\/\/)/.test(remote)) return remote.replace(/^((?:[^/@:]+@)?)[^/:]+:/, `$1${host}:`);
  const url = new URL(remote);
  if (url.protocol !== "ssh:") throw new Error("SSH aliases require an SSH remote URL.");
  url.hostname = host;
  return url.toString();
}

export async function repairRepositoryIdentity(
  profile: Profile,
  remoteUrl: string,
  runner: CommandRunner = runCommand,
  ctx?: PathContext,
): Promise<void> {
  const paths = await Promise.all(["config", "config.worktree"].map(async (name) => {
    const result = await runner("git", ["rev-parse", "--path-format=absolute", "--git-path", name]);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "Not in a Git repository.");
    const path = resolve(result.stdout.trim());
    const content = await readFile(path, "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    });
    return { path, content };
  }));
  const backupDir = backupsDir(ctx);
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backup = join(backupDir, `repository-${Date.now()}-${randomUUID()}.json`);
  await writeFile(backup, JSON.stringify({ files: paths }, null, 2), { mode: 0o600 });
  try {
    const remoteHost = parseGitSshHost(remoteUrl);
    if (remoteHost && remoteHost !== profile.host) {
      await runRequiredGitConfig(["remote", "set-url", "origin", replaceRemoteHost(remoteUrl, profile.host)], runner);
    }
    const worktree = await runner("git", ["config", "--bool", "extensions.worktreeConfig"]);
    for (const scope of worktree.stdout.trim() === "true" ? ["--local", "--worktree"] : ["--local"]) {
      for (const key of ["user.name", "user.email"]) {
        const result = await runner("git", ["config", scope, "--unset-all", key]);
        if (result.exitCode !== 0 && result.exitCode !== 5) throw new Error(result.stderr.trim() || `Could not clear ${key}.`);
      }
    }
    const effective = await readEffectiveGitIdentity(runner);
    if (profile.git_name && profile.git_email && (effective.name !== profile.git_name || effective.email !== profile.git_email)) {
      // Multiple remotes or repository includes can override the global rule.
      // Keep the author in the generated identity file so future edits still apply.
      const config = paths[worktree.stdout.trim() === "true" ? 1 : 0];
      if (!config) throw new Error("Repository config path is missing.");
      const existing = await readFile(config.path, "utf8").catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
        throw error;
      });
      const start = existing.indexOf(REPO_START);
      const end = existing.indexOf(REPO_END);
      if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) throw new Error("Incomplete repository identity block.");
      const base = start === -1 ? existing : existing.slice(0, start) + existing.slice(end + REPO_END.length).replace(/^\r?\n/, "");
      await writeFile(config.path, `${base}${base.endsWith("\n") ? "" : "\n"}${REPO_START}\n${renderGitRouting([profile], ctx)}${REPO_END}\n`, "utf8");
    }
  } catch (error) {
    const restored = await Promise.allSettled(paths.map(async ({ path, content }) => {
      if (content === undefined) await rm(path, { force: true });
      else await writeFile(path, content, "utf8");
    }));
    if (restored.some((result) => result.status === "rejected")) throw new Error(`Repository restore failed. Backup: ${backup}`, { cause: error });
    throw error;
  }
}

export async function setLocalGitIdentity(
  identity: Required<GitIdentity>,
  runner: CommandRunner = runCommand,
): Promise<void> {
  await runRequiredGitConfig(["config", "--local", "user.name", identity.name], runner);
  await runRequiredGitConfig(["config", "--local", "user.email", identity.email], runner);
}

async function readGitIdentity(
  scope: "global" | "local" | undefined,
  runner: CommandRunner,
): Promise<GitIdentity> {
  const scopeArgs = scope ? [`--${scope}`] : [];
  const [name, email] = await Promise.all([
    readGitConfigValue(["config", ...scopeArgs, "user.name"], runner),
    readGitConfigValue(["config", ...scopeArgs, "user.email"], runner),
  ]);

  const identity: GitIdentity = {};
  if (name) {
    identity.name = name;
  }
  if (email) {
    identity.email = email;
  }
  return identity;
}

async function runRequiredGitConfig(args: string[], runner: CommandRunner): Promise<void> {
  const result = await runner("git", args);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
}

async function readGitConfigValue(
  args: string[],
  runner: CommandRunner,
): Promise<string | undefined> {
  const result = await runner("git", args);
  if (result.exitCode !== 0) {
    return undefined;
  }
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}
