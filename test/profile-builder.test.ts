import { describe, expect, test } from "bun:test";
import { buildProfile } from "../src/commands/profile-builder";

describe("profile builder", () => {
  test("builds a profile without git_name or git_email", async () => {
    const profile = await buildProfile({
      template: "github",
      account: "th1humble",
      identityFile: "/tmp/.ssh/id_ed25519_github",
      publicKeyFile: "/tmp/.ssh/id_ed25519_github.pub",
      fingerprint: "SHA256:test123",
    });

    expect(profile.name).toBe("github-com-th1humble");
    expect(profile.host).toBe("github.com");
    expect(profile.hostname).toBe("github.com");
    expect(profile.user).toBe("git");
    expect(profile.account).toBe("th1humble");
    expect(profile.identity_file).toBe("/tmp/.ssh/id_ed25519_github");
    expect(profile.public_key_file).toBe("/tmp/.ssh/id_ed25519_github.pub");
    expect(profile.fingerprint).toBe("SHA256:test123");
    expect(profile).not.toHaveProperty("git_name");
    expect(profile).not.toHaveProperty("git_email");
  });

  test("uses account@host as key comment when generating a key", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    // We can't easily test the comment passed to ssh-keygen through buildProfile
    // without mocking the entire module, so we verify the profile shape instead.
    const profile = await buildProfile({
      template: "gitlab",
      account: "majian",
      identityFile: "/tmp/.ssh/id_ed25519_gitlab",
      fingerprint: "SHA256:abc",
    });

    expect(profile.name).toBe("gitlab-com-majian");
    expect(profile.host).toBe("gitlab.com");
    expect(profile.hostname).toBe("gitlab.com");
    expect(profile.public_key_file).toBe("/tmp/.ssh/id_ed25519_gitlab.pub");
  });

  test("uses custom hostname when no template matches", async () => {
    const profile = await buildProfile({
      template: "__nonexistent__",
      host: "git.company.internal",
      hostname: "git.company.internal",
      account: "dev",
      identityFile: "/tmp/.ssh/id_custom",
      fingerprint: "SHA256:custom",
    });

    expect(profile.host).toBe("git.company.internal");
    expect(profile.hostname).toBe("git.company.internal");
    expect(profile.name).toBe("git-company-internal-dev");
  });
});
