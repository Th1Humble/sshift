import { describe, expect, test } from "bun:test";
import {
  backupsDir,
  profilesPath,
  sshConfigPath,
  sshDir,
  sshiftConfigDir,
} from "../src/utils/paths";

describe("path helpers", () => {
  test("builds paths from an injectable home directory", () => {
    const ctx = { homeDir: "/tmp/example-home" };

    expect(sshDir(ctx)).toBe("/tmp/example-home/.ssh");
    expect(sshConfigPath(ctx)).toBe("/tmp/example-home/.ssh/config");
    expect(sshiftConfigDir(ctx)).toBe("/tmp/example-home/.config/sshift");
    expect(profilesPath(ctx)).toBe("/tmp/example-home/.config/sshift/profiles.toml");
    expect(backupsDir(ctx)).toBe("/tmp/example-home/.config/sshift/backups");
  });
});
