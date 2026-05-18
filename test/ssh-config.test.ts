import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MANAGED_END,
  MANAGED_START,
  applyProfilesToSshConfig,
  detectUnmanagedHostConflicts,
  renderManagedBlock,
  upsertManagedBlock,
} from "../src/core/ssh-config";
import type { Profile } from "../src/types";
import { backupsDir, sshConfigPath, sshDir, type PathContext } from "../src/utils/paths";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "github-personal",
    host: "github.com",
    hostname: "github.com",
    user: "git",
    account: "Th1Humble",
    identity_file: "~/.ssh/id_ed25519_github",
    public_key_file: "~/.ssh/id_ed25519_github.pub",
    fingerprint: "SHA256:example",
    ...overrides,
  };
}

const homes: string[] = [];

async function tempContext(): Promise<PathContext> {
  const homeDir = await mkdtemp(join(tmpdir(), "sshift-config-"));
  homes.push(homeDir);
  await mkdir(sshDir({ homeDir }), { recursive: true });
  return { homeDir };
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("ssh config managed block", () => {
  test("renders profiles into a managed OpenSSH config block", () => {
    const block = renderManagedBlock([profile()]);

    expect(block).toContain(MANAGED_START);
    expect(block).toContain("# profile: github-personal");
    expect(block).toContain("Host github.com");
    expect(block).toContain("  HostName github.com");
    expect(block).toContain("  User git");
    expect(block).toContain("  IdentityFile ~/.ssh/id_ed25519_github");
    expect(block).toContain("  IdentitiesOnly yes");
    expect(block).toContain(MANAGED_END);
  });

  test("inserts the managed block before unmanaged content", () => {
    const existing = ["Host *", "  AddKeysToAgent yes", ""].join("\n");

    const updated = upsertManagedBlock(existing, [profile()]);

    expect(updated.startsWith(MANAGED_START)).toBe(true);
    expect(updated).toContain("Host *\n  AddKeysToAgent yes");
  });

  test("replaces only the existing managed block", () => {
    const existing = [
      "Host work",
      "  IdentityFile ~/.ssh/work",
      "",
      MANAGED_START,
      "# profile: old",
      "Host old.example.com",
      "  IdentityFile ~/.ssh/old",
      MANAGED_END,
      "",
      "Host personal",
      "  IdentityFile ~/.ssh/personal",
      "",
    ].join("\n");

    const updated = upsertManagedBlock(existing, [
      profile({ name: "gitlab", host: "gitlab.com", hostname: "gitlab.com" }),
    ]);

    expect(updated).toContain("Host work\n  IdentityFile ~/.ssh/work");
    expect(updated).toContain("Host personal\n  IdentityFile ~/.ssh/personal");
    expect(updated).not.toContain("old.example.com");
    expect(updated).toContain("Host gitlab.com");
  });

  test("applies profiles to ssh config and backs up existing config", async () => {
    const ctx = await tempContext();
    await writeFile(sshConfigPath(ctx), "Host *\n  AddKeysToAgent yes\n", "utf8");

    const backup = await applyProfilesToSshConfig([profile()], "sshift add github-personal", ctx);

    const updated = await readFile(sshConfigPath(ctx), "utf8");
    expect(updated).toStartWith(MANAGED_START);
    expect(updated).toContain("Host github.com");
    expect(updated).toContain("Host *\n  AddKeysToAgent yes");
    expect(backup.file_path).toStartWith(backupsDir(ctx));
    await expect(readFile(backup.file_path, "utf8")).resolves.toBe(
      "Host *\n  AddKeysToAgent yes\n",
    );
  });

  test("detects unmanaged hosts that conflict with profile hosts", () => {
    const existing = [
      "Host github.com",
      "  IdentityFile ~/.ssh/old_github",
      "",
      MANAGED_START,
      "# profile: github-personal",
      "Host github.com",
      "  IdentityFile ~/.ssh/id_github",
      MANAGED_END,
      "",
      "Host gitlab.com",
      "  IdentityFile ~/.ssh/gitlab",
      "",
    ].join("\n");

    expect(detectUnmanagedHostConflicts(existing, [profile()])).toEqual(["github.com"]);
  });
});
