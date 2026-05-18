import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const installScriptPath = join(import.meta.dir, "..", "install.sh");

describe("install script", () => {
  test("resolves latest release without depending on the GitHub API first", async () => {
    const script = await readFile(installScriptPath, "utf8");

    expect(script).toContain("https://github.com/${REPO}/releases/latest");
    expect(script).toContain("api.github.com/repos/${REPO}/releases/latest");
    expect(script.indexOf("https://github.com/${REPO}/releases/latest")).toBeLessThan(
      script.indexOf("api.github.com/repos/${REPO}/releases/latest"),
    );
  });
});
