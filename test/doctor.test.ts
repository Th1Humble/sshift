import { describe, expect, test } from "bun:test";
import {
  diagnoseRepoFromRemote,
  parseGitSshHost,
  parseResolvedIdentityFiles,
  parseSshAuthResult,
} from "../src/core/doctor";
import type { Profile } from "../src/types";

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

describe("doctor helpers", () => {
  test("extracts SSH hosts from common Git remote URLs", () => {
    expect(parseGitSshHost("git@github.com:Th1Humble/sshift.git")).toBe("github.com");
    expect(parseGitSshHost("ssh://git@gitlab.com/group/repo.git")).toBe("gitlab.com");
    expect(parseGitSshHost("https://github.com/Th1Humble/sshift")).toBeUndefined();
  });

  test("treats GitHub authenticated shell denial as success", () => {
    expect(
      parseSshAuthResult({
        host: "github.com",
        exitCode: 1,
        stdout: "",
        stderr:
          "Hi Th1Humble! You've successfully authenticated, but GitHub does not provide shell access.",
      }),
    ).toEqual({ ok: true, message: "Authenticated as Th1Humble" });
  });

  test("turns public key denial into an actionable message", () => {
    expect(
      parseSshAuthResult({
        host: "github.com",
        exitCode: 255,
        stdout: "",
        stderr: "git@github.com: Permission denied (publickey).",
      }),
    ).toEqual({
      ok: false,
      message:
        "Permission denied (publickey). The selected public key is probably not registered on the Git host, or the host is using a different key.",
    });
  });

  test("parses identity files from ssh -G output", () => {
    expect(
      parseResolvedIdentityFiles(
        ["host github.com", "user git", "identityfile ~/.ssh/id_github", ""].join("\n"),
      ),
    ).toEqual(["~/.ssh/id_github"]);
  });

  test("matches a remote host to a configured profile", () => {
    expect(
      diagnoseRepoFromRemote("git@github.com:Th1Humble/sshift.git", [githubProfile()]),
    ).toEqual({
      remote_host: "github.com",
      profile: githubProfile(),
    });
  });
});
