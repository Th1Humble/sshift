import { describe, expect, test } from "bun:test";
import { createTable } from "../src/utils/table";

describe("table output", () => {
  test("does not emit ANSI color escapes", () => {
    const table = createTable(["Name", "Host"]);
    table.push(["github-personal", "github.com"]);

    expect(table.toString()).not.toContain("\u001b[");
  });
});
