import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanEnvironment } from "../src/core/scan";
import { MANAGED_END, MANAGED_START } from "../src/core/ssh-config";
import { addProfile } from "../src/core/profiles";
import { sshConfigPath, sshDir, type PathContext } from "../src/utils/paths";
import type { Profile } from "../src/types";

const homes: string[] = [];

async function tempContext(): Promise<PathContext> {
  const homeDir = await mkdtemp(join(tmpdir(), "sshift-scan-"));
  homes.push(homeDir);
  await mkdir(sshDir({ homeDir }), { recursive: true });
  return { homeDir };
}

function githubProfile(): Profile {
  return {
    name: "github-personal",
    host: "github.com",
    hostname: "github.com",
    user: "git",
    account: "Th1Humble",
    identity_file: "~/.ssh/id_ed25519_github",
    public_key_file: "~/.ssh/id_ed25519_github.pub",
    fingerprint: "SHA256:profile",
  };
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("environment scan", () => {
  test("collects ssh keys, ssh config hosts, git identity, and profiles", async () => {
    const ctx = await tempContext();
    await writeFile(join(sshDir(ctx), "id_github.pub"), "ssh-ed25519 AAAA github\n", "utf8");
    await writeFile(
      sshConfigPath(ctx),
      [
        MANAGED_START,
        "# profile: github-personal",
        "Host github.com",
        "  HostName github.com",
        "  User git",
        "  IdentityFile ~/.ssh/id_ed25519_github",
        MANAGED_END,
        "",
        "Host internal",
        "  HostName git.internal.example.com",
        "  User git",
        "  IdentityFile ~/.ssh/id_internal",
        "",
      ].join("\n"),
      "utf8",
    );
    await addProfile(githubProfile(), ctx);

    const scan = await scanEnvironment(ctx, {
      run: async (command, args) => {
        if (command === "ssh-keygen") {
          return { exitCode: 0, stdout: "256 SHA256:key github (ED25519)\n", stderr: "" };
        }
        if (command === "which") {
          return { exitCode: 0, stdout: `/usr/bin/${args[0]}\n`, stderr: "" };
        }
        if (command === "git" && args.join(" ") === "config --global user.name") {
          return { exitCode: 0, stdout: "Th1Humble\n", stderr: "" };
        }
        if (command === "git" && args.join(" ") === "config --global user.email") {
          return { exitCode: 0, stdout: "mjsdbd921@gmail.com\n", stderr: "" };
        }
        return { exitCode: 1, stdout: "", stderr: "" };
      },
    });

    expect(scan.ssh_path).toBe("/usr/bin/ssh");
    expect(scan.git_path).toBe("/usr/bin/git");
    expect(scan.public_keys).toHaveLength(1);
    expect(scan.ssh_hosts).toEqual([
      {
        host: "github.com",
        hostname: "github.com",
        user: "git",
        identity_file: "~/.ssh/id_ed25519_github",
        managed: true,
      },
      {
        host: "internal",
        hostname: "git.internal.example.com",
        user: "git",
        identity_file: "~/.ssh/id_internal",
        managed: false,
      },
    ]);
    expect(scan.git_global_identity).toEqual({
      name: "Th1Humble",
      email: "mjsdbd921@gmail.com",
    });
    expect(scan.profiles).toEqual([githubProfile()]);
  });
});
