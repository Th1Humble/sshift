import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PublicKeyInfo } from "../types";
import { sshDir, type PathContext } from "../utils/paths";
import { runCommand, type CommandRunner } from "../utils/shell";

export interface FingerprintInfo {
  fingerprint: string;
  comment: string;
}

export interface GenerateKeyOptions {
  identityFile: string;
  comment: string;
  passphrase: string;
  runner?: CommandRunner;
}

export function parseFingerprintOutput(output: string): FingerprintInfo {
  const parts = output.trim().split(/\s+/);
  const fingerprint = parts[1];
  const comment = parts.slice(2, -1).join(" ");

  if (!fingerprint) {
    throw new Error(`Unable to parse ssh-keygen fingerprint output: ${output}`);
  }

  return { fingerprint, comment };
}

export async function discoverPublicKeys(
  ctx?: PathContext,
  runner: CommandRunner = runCommand,
): Promise<PublicKeyInfo[]> {
  const dir = sshDir(ctx);
  const entries = await readdir(dir).catch(() => []);
  const publicKeyFiles = entries.filter((entry) => entry.endsWith(".pub")).sort();
  const keys: PublicKeyInfo[] = [];

  for (const entry of publicKeyFiles) {
    const publicKeyFile = join(dir, entry);
    const result = await runner("ssh-keygen", ["-lf", publicKeyFile]);

    if (result.exitCode !== 0) {
      continue;
    }

    const parsed = parseFingerprintOutput(result.stdout);
    keys.push({
      public_key_file: publicKeyFile,
      identity_file: publicKeyFile.slice(0, -4),
      fingerprint: parsed.fingerprint,
      comment: parsed.comment,
    });
  }

  return keys;
}

export async function generateKey(options: GenerateKeyOptions): Promise<void> {
  const runner = options.runner ?? runCommand;
  if (!options.runner) {
    for (const path of [options.identityFile, `${options.identityFile}.pub`]) {
      const exists = await stat(path).then(() => true).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
      });
      if (exists) throw new Error(`Key file already exists: ${path}. Choose the existing key or a different path.`);
    }
    await mkdir(dirname(options.identityFile), { recursive: true, mode: 0o700 });
  }
  const result = await runner("ssh-keygen", [
    "-t",
    "ed25519",
    "-C",
    options.comment,
    "-f",
    options.identityFile,
    "-N",
    options.passphrase,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "ssh-keygen failed");
  }
}
