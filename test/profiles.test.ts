import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PathContext } from "../src/utils/paths";
import {
  addProfile,
  loadProfiles,
  removeProfile,
  saveProfiles,
} from "../src/core/profiles";
import type { Profile } from "../src/types";

const homes: string[] = [];

async function tempContext(): Promise<PathContext> {
  const homeDir = await mkdtemp(join(tmpdir(), "sshift-profiles-"));
  homes.push(homeDir);
  return { homeDir };
}

function githubProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "github-personal",
    host: "github.com",
    hostname: "github.com",
    user: "git",
    account: "Th1Humble",
    identity_file: "~/.ssh/id_ed25519_github",
    public_key_file: "~/.ssh/id_ed25519_github.pub",
    fingerprint: "SHA256:example",
    git_name: "Th1Humble",
    git_email: "mjsdbd921@gmail.com",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("profiles store", () => {
  test("loads an empty profile store when no file exists", async () => {
    const ctx = await tempContext();

    await expect(loadProfiles(ctx)).resolves.toEqual({ profiles: [] });
  });

  test("saves and loads profiles as TOML", async () => {
    const ctx = await tempContext();
    const profile = githubProfile();

    await saveProfiles({ profiles: [profile] }, ctx);

    await expect(loadProfiles(ctx)).resolves.toEqual({ profiles: [profile] });
  });

  test("rejects duplicate profile names", async () => {
    const ctx = await tempContext();

    await addProfile(githubProfile(), ctx);

    await expect(addProfile(githubProfile({ host: "gitlab.com" }), ctx)).rejects.toThrow(
      "Profile already exists: github-personal",
    );
  });

  test("rejects duplicate hosts in v1", async () => {
    const ctx = await tempContext();

    await addProfile(githubProfile(), ctx);

    await expect(
      addProfile(githubProfile({ name: "github-work", account: "work" }), ctx),
    ).rejects.toThrow("Host already has a profile in v1: github.com");
  });

  test("removes a profile by name", async () => {
    const ctx = await tempContext();

    await addProfile(githubProfile(), ctx);
    await removeProfile("github-personal", ctx);

    await expect(loadProfiles(ctx)).resolves.toEqual({ profiles: [] });
  });
});
