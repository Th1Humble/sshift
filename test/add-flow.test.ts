import { describe, expect, test } from "bun:test";
import { collectAddSessionProfiles } from "../src/core/add-flow";
import type { Profile } from "../src/types";

function profile(name: string): Profile {
  return {
    name,
    host: `${name}.example.com`,
    hostname: `${name}.example.com`,
    user: "git",
    account: name,
    identity_file: `~/.ssh/${name}`,
    public_key_file: `~/.ssh/${name}.pub`,
    fingerprint: `SHA256:${name}`,
  };
}

describe("add flow", () => {
  test("adds one profile and stops when the user does not want another", async () => {
    const profiles = await collectAddSessionProfiles({
      createProfile: async () => profile("github"),
      confirmAnother: async () => false,
      onProfilesChanged: async () => undefined,
    });

    expect(profiles.map((item) => item.name)).toEqual(["github"]);
  });

  test("shows updated profile state after each addition", async () => {
    const names = ["github", "work"];
    const snapshots: string[][] = [];

    await collectAddSessionProfiles({
      createProfile: async () => profile(names.shift() ?? "extra"),
      confirmAnother: async (profiles) => profiles.length < 2,
      onProfilesChanged: async (profiles) => {
        snapshots.push(profiles.map((item) => item.name));
      },
    });

    expect(snapshots).toEqual([["github"], ["github", "work"]]);
  });
});
