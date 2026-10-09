import { join, resolve } from "node:path";

export interface PathContext {
  homeDir: string;
  gitConfigFile?: string;
}

export function defaultPathContext(): PathContext {
  return {
    homeDir: process.env.HOME ?? "",
    ...(process.env.GIT_CONFIG_GLOBAL ? { gitConfigFile: resolve(process.env.GIT_CONFIG_GLOBAL) } : {}),
  };
}

export function sshDir(ctx: PathContext = defaultPathContext()): string {
  return join(ctx.homeDir, ".ssh");
}

export function sshConfigPath(ctx: PathContext = defaultPathContext()): string {
  return join(sshDir(ctx), "config");
}

export function sshiftConfigDir(ctx: PathContext = defaultPathContext()): string {
  return join(ctx.homeDir, ".config", "sshift");
}

export function profilesPath(ctx: PathContext = defaultPathContext()): string {
  return join(sshiftConfigDir(ctx), "profiles.toml");
}

export function backupsDir(ctx: PathContext = defaultPathContext()): string {
  return join(sshiftConfigDir(ctx), "backups");
}

export function globalGitConfigPath(ctx: PathContext = defaultPathContext()): string {
  return ctx.gitConfigFile ?? join(ctx.homeDir, ".gitconfig");
}

export function managedGitConfigPath(ctx?: PathContext): string {
  return join(sshiftConfigDir(ctx), "git.conf");
}
