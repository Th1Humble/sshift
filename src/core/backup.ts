import { copyFile, mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BackupRecord } from "../types";
import { backupsDir, sshConfigPath, type PathContext } from "../utils/paths";

export async function backupSshConfig(
  reason: string,
  ctx?: PathContext,
): Promise<BackupRecord> {
  const timestamp = timestampForFile();
  const dir = backupsDir(ctx);
  const filePath = join(dir, `ssh_config.${timestamp}`);

  await mkdir(dir, { recursive: true });
  await copyFile(sshConfigPath(ctx), filePath);

  return {
    timestamp,
    file_path: filePath,
    reason,
  };
}

export async function restoreBackup(backupPath: string, ctx?: PathContext): Promise<void> {
  await copyFile(backupPath, sshConfigPath(ctx));
}

export async function latestBackup(ctx?: PathContext): Promise<string | undefined> {
  const dir = backupsDir(ctx);
  const entries = await readdir(dir).catch(() => []);
  const backups = entries
    .filter((entry) => entry.startsWith("ssh_config."))
    .sort((a, b) => a.localeCompare(b));

  const latest = backups.at(-1);
  return latest ? join(dir, basename(latest)) : undefined;
}

function timestampForFile(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}
