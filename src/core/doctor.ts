import type { Profile } from "../types";

export interface SshAuthParseInput {
  host: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SshAuthResult {
  ok: boolean;
  message: string;
}

export interface RepoDiagnosis {
  remote_host?: string;
  profile?: Profile;
}

export function parseGitSshHost(remoteUrl: string): string | undefined {
  const scpLike = remoteUrl.match(/^[^@]+@([^:]+):/);
  if (scpLike?.[1]) {
    return scpLike[1];
  }

  try {
    const url = new URL(remoteUrl);
    if (url.protocol === "ssh:") {
      return url.hostname;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function parseSshAuthResult(input: SshAuthParseInput): SshAuthResult {
  const output = `${input.stdout}\n${input.stderr}`;

  if (output.includes("Permission denied (publickey)")) {
    return {
      ok: false,
      message:
        "Permission denied (publickey). The selected public key is probably not registered on the Git host, or the host is using a different key.",
    };
  }

  if (input.host === "github.com" && output.includes("successfully authenticated")) {
    const match = output.match(/Hi ([^!]+)!/);
    return { ok: true, message: `Authenticated as ${match?.[1] ?? "GitHub user"}` };
  }

  if (input.exitCode === 0) {
    return { ok: true, message: output.trim() || "Authenticated" };
  }

  return { ok: false, message: output.trim() || "SSH authentication failed" };
}

export function parseResolvedIdentityFiles(sshGOutput: string): string[] {
  return sshGOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith("identityfile "))
    .map((line) => line.slice("identityfile ".length).trim())
    .filter((value) => value.length > 0);
}

export function diagnoseRepoFromRemote(
  remoteUrl: string,
  profiles: Profile[],
): RepoDiagnosis {
  const remoteHost = parseGitSshHost(remoteUrl);
  const diagnosis: RepoDiagnosis = {};

  if (remoteHost) {
    diagnosis.remote_host = remoteHost;
    const profile = profiles.find((candidate) => candidate.host === remoteHost);
    if (profile) {
      diagnosis.profile = profile;
    }
  }

  return diagnosis;
}
