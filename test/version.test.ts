import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";
import { CLI_VERSION } from "../src/version";

describe("CLI version", () => {
  test("comes from package metadata", () => {
    expect(CLI_VERSION).toBe(packageJson.version);
  });
});
