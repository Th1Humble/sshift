import { describe, expect, test } from "bun:test";
import { formatKeyValue } from "../src/utils/output";

describe("output helpers", () => {
  test("colors only the key in key-value output", () => {
    const line = formatKeyValue("Routing host", "github.com", 14, { color: true });

    expect(line).toContain("\u001b[");
    expect(line).toContain("Routing host:");
    expect(line.endsWith("github.com")).toBe(true);
  });
});
