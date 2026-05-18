import { describe, expect, test } from "bun:test";
import { defaultKeyName, defaultProfileName, getHostTemplate } from "../src/utils/host";

describe("host templates", () => {
  test("provides optional GitHub defaults", () => {
    expect(getHostTemplate("github")).toEqual({
      label: "GitHub",
      host: "github.com",
      hostname: "github.com",
      user: "git",
    });
  });

  test("builds readable default names from host and account", () => {
    expect(defaultProfileName("github.com", "Th1Humble")).toBe("github-com-th1humble");
    expect(defaultProfileName("git.internal.company.com", "majian")).toBe(
      "git-internal-company-com-majian",
    );
    expect(defaultKeyName("github.com")).toBe("id_ed25519_github_com");
    expect(defaultKeyName("git.internal.company.com")).toBe(
      "id_ed25519_git_internal_company_com",
    );
  });
});
