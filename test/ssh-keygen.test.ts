import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverPublicKeys, generateKey, parseFingerprintOutput } from "../src/core/ssh-keygen";
import { sshDir, type PathContext } from "../src/utils/paths";

const homes: string[] = [];

async function tempContext(): Promise<PathContext> {
  const homeDir = await mkdtemp(join(tmpdir(), "sshift-keys-"));
  homes.push(homeDir);
  await mkdir(sshDir({ homeDir }), { recursive: true });
  return { homeDir };
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("ssh key helpers", () => {
  test("parses ssh-keygen fingerprint output", () => {
    const parsed = parseFingerprintOutput(
      "256 SHA256:abc123 mjsdbd921@gmail.com (ED25519)\n",
    );

    expect(parsed).toEqual({
      fingerprint: "SHA256:abc123",
      comment: "mjsdbd921@gmail.com",
    });
  });

  test("discovers public keys and maps them to private key paths", async () => {
    const ctx = await tempContext();
    const pubPath = join(sshDir(ctx), "id_github.pub");
    await writeFile(pubPath, "ssh-ed25519 AAAA comment\n", "utf8");

    const keys = await discoverPublicKeys(ctx, async () => ({
      exitCode: 0,
      stdout: "256 SHA256:abc123 github (ED25519)\n",
      stderr: "",
    }));

    expect(keys).toEqual([
      {
        public_key_file: pubPath,
        identity_file: join(sshDir(ctx), "id_github"),
        fingerprint: "SHA256:abc123",
        comment: "github",
      },
    ]);
  });

  test("generates an ed25519 key through native ssh-keygen", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    await generateKey({
      identityFile: "/tmp/id_test",
      comment: "github@example.com",
      passphrase: "",
      runner: async (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(calls).toEqual([
      {
        command: "ssh-keygen",
        args: ["-t", "ed25519", "-C", "github@example.com", "-f", "/tmp/id_test", "-N", ""],
      },
    ]);
  });
});
