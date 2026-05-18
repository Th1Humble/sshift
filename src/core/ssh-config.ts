import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Profile } from "../types";
import type { BackupRecord } from "../types";
import { backupSshConfig } from "./backup";
import { parseSshConfigHosts } from "./scan";
import { sshConfigPath, type PathContext } from "../utils/paths";

export const MANAGED_START = "# --- sshift managed start ---";
export const MANAGED_END = "# --- sshift managed end ---";

export function renderManagedBlock(profiles: Profile[]): string {
  const lines = [MANAGED_START];

  for (const profile of profiles) {
    lines.push(`# profile: ${profile.name}`);
    lines.push(`Host ${profile.host}`);
    lines.push(`  HostName ${profile.hostname}`);
    lines.push(`  User ${profile.user}`);
    lines.push(`  IdentityFile ${profile.identity_file}`);
    lines.push("  IdentitiesOnly yes");
    lines.push("");
  }

  if (lines.at(-1) === "") {
    lines.pop();
  }

  lines.push(MANAGED_END);
  return `${lines.join("\n")}\n`;
}

export function upsertManagedBlock(existingConfig: string, profiles: Profile[]): string {
  const managedBlock = renderManagedBlock(profiles);
  const withoutManaged = removeManagedBlock(existingConfig).trimStart();

  if (withoutManaged.length === 0) {
    return managedBlock;
  }

  return `${managedBlock}\n${withoutManaged}`;
}

export async function applyProfilesToSshConfig(
  profiles: Profile[],
  reason: string,
  ctx?: PathContext,
): Promise<BackupRecord> {
  const path = sshConfigPath(ctx);
  await mkdir(dirname(path), { recursive: true });
  const existing = await readFile(path, "utf8").catch((error: unknown) => {
    if (isNotFound(error)) {
      return "";
    }
    throw error;
  });

  if (existing.length === 0) {
    await writeFile(path, "", "utf8");
  }

  const backup = await backupSshConfig(reason, ctx);
  await writeFile(path, upsertManagedBlock(existing, profiles), "utf8");
  return backup;
}

export function detectUnmanagedHostConflicts(
  existingConfig: string,
  profiles: Profile[],
): string[] {
  const profileHosts = new Set(profiles.map((profile) => profile.host));
  const conflicts = new Set<string>();

  for (const host of parseSshConfigHosts(existingConfig)) {
    if (!host.managed && profileHosts.has(host.host)) {
      conflicts.add(host.host);
    }
  }

  return [...conflicts].sort();
}

function removeManagedBlock(config: string): string {
  const start = config.indexOf(MANAGED_START);
  const end = config.indexOf(MANAGED_END);

  if (start === -1 || end === -1 || end < start) {
    return config;
  }

  const afterEnd = end + MANAGED_END.length;
  return `${config.slice(0, start)}${config.slice(afterEnd)}`;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
