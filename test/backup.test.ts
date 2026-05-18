import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backupSshConfig, latestBackup, restoreBackup } from "../src/core/backup";
import { backupsDir, sshConfigPath, sshDir, type PathContext } from "../src/utils/paths";

const homes: string[] = [];

async function tempContext(): Promise<PathContext> {
  const homeDir = await mkdtemp(join(tmpdir(), "sshift-backup-"));
  homes.push(homeDir);
  await mkdir(sshDir({ homeDir }), { recursive: true });
  return { homeDir };
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("ssh config backups", () => {
  test("creates a timestamped backup of ssh config", async () => {
    const ctx = await tempContext();
    await writeFile(sshConfigPath(ctx), "Host github.com\n", "utf8");

    const backup = await backupSshConfig("test backup", ctx);

    expect(backup.reason).toBe("test backup");
    expect(backup.file_path).toStartWith(backupsDir(ctx));
    await expect(readFile(backup.file_path, "utf8")).resolves.toBe("Host github.com\n");
  });

  test("restores a backup over the ssh config", async () => {
    const ctx = await tempContext();
    await writeFile(sshConfigPath(ctx), "before\n", "utf8");
    const backup = await backupSshConfig("test backup", ctx);
    await writeFile(sshConfigPath(ctx), "after\n", "utf8");

    await restoreBackup(backup.file_path, ctx);

    await expect(readFile(sshConfigPath(ctx), "utf8")).resolves.toBe("before\n");
  });

  test("returns the newest backup", async () => {
    const ctx = await tempContext();
    await writeFile(sshConfigPath(ctx), "one\n", "utf8");
    await backupSshConfig("first", ctx);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await writeFile(sshConfigPath(ctx), "two\n", "utf8");
    const second = await backupSshConfig("second", ctx);

    await expect(latestBackup(ctx)).resolves.toEqual(second.file_path);
  });
});
