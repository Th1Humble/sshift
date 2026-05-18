import { describe, expect, test } from "bun:test";
import {
  readLocalGitIdentity,
  setLocalGitIdentity,
} from "../src/core/git-config";

describe("git config helpers", () => {
  test("reads local git identity", async () => {
    const calls: string[] = [];
    const identity = await readLocalGitIdentity(async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (args.join(" ") === "config --local user.name") {
        return { exitCode: 0, stdout: "Th1Humble\n", stderr: "" };
      }
      if (args.join(" ") === "config --local user.email") {
        return { exitCode: 0, stdout: "mjsdbd921@gmail.com\n", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    });

    expect(identity).toEqual({
      name: "Th1Humble",
      email: "mjsdbd921@gmail.com",
    });
    expect(calls).toEqual([
      "git config --local user.name",
      "git config --local user.email",
    ]);
  });

  test("sets local git identity", async () => {
    const calls: string[] = [];

    await setLocalGitIdentity(
      { name: "Th1Humble", email: "mjsdbd921@gmail.com" },
      async (command, args) => {
        calls.push([command, ...args].join(" "));
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    );

    expect(calls).toEqual([
      "git config --local user.name Th1Humble",
      "git config --local user.email mjsdbd921@gmail.com",
    ]);
  });
});
