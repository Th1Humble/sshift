import type { GitIdentity } from "../types";
import { runCommand, type CommandRunner } from "../utils/shell";

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

export async function setLocalGitIdentity(
  identity: Required<GitIdentity>,
  runner: CommandRunner = runCommand,
): Promise<void> {
  await runRequiredGitConfig(["config", "--local", "user.name", identity.name], runner);
  await runRequiredGitConfig(["config", "--local", "user.email", identity.email], runner);
}

async function readGitIdentity(
  scope: "global" | "local",
  runner: CommandRunner,
): Promise<GitIdentity> {
  const scopeArg = `--${scope}`;
  const [name, email] = await Promise.all([
    readGitConfigValue(["config", scopeArg, "user.name"], runner),
    readGitConfigValue(["config", scopeArg, "user.email"], runner),
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
