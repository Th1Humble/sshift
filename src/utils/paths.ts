import { join } from "node:path";

export interface PathContext {
  homeDir: string;
}

export function defaultPathContext(): PathContext {
  return { homeDir: process.env.HOME ?? "" };
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
