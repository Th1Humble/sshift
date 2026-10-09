import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Profile, SshHostEntry } from "../types";
import type { BackupRecord } from "../types";
import { backupSshConfig } from "./backup";
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
    const key = /\s/.test(profile.identity_file) ? `"${profile.identity_file.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"` : profile.identity_file;
    lines.push(`  IdentityFile ${key}`);
    lines.push("  IdentitiesOnly yes");
    lines.push("");
  }

  if (lines.at(-1) === "") {
    lines.pop();
  }

  // Restore the default scope before any existing top-level SSH options.
  if (profiles.length) lines.push("Host *");
  lines.push(MANAGED_END);
  return `${lines.join("\n")}\n`;
}

export function upsertManagedBlock(existingConfig: string, profiles: Profile[]): string {
  const managedBlock = profiles.length ? renderManagedBlock(profiles) : "";
  const withoutManaged = removeManagedBlock(existingConfig);

  if (withoutManaged.length === 0) {
    return managedBlock;
  }

  return managedBlock ? `${managedBlock}\n${withoutManaged}` : withoutManaged;
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
  const profileHosts = new Set(profiles.map((profile) => profile.host.toLowerCase()));
  const conflicts = new Set<string>();

  for (const host of parseSshConfigHosts(existingConfig)) {
    if (!host.managed) {
      for (const pattern of host.host.split(/\s+/)) {
        if (profileHosts.has(pattern.toLowerCase())) conflicts.add(pattern.toLowerCase());
      }
    }
  }

  return [...conflicts].sort();
}

function removeManagedBlock(config: string): string {
  const start = config.indexOf(MANAGED_START);
  const end = config.indexOf(MANAGED_END);

  if (start === -1 && end === -1) return config;
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The sshift SSH config block is incomplete. Restore it from a backup before continuing.");
  }

  const afterEnd = end + MANAGED_END.length;
  let after = config.slice(afterEnd).replace(/^\r?\n/, "");
  if (start === 0) after = after.replace(/^\r?\n/, "");
  return `${config.slice(0, start)}${after}`;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
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
