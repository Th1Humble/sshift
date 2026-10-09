import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { Profile } from "../src/types";
import { identityConfigPath, requireIdentityGit, saveAndApplyProfiles, upsertGitInclude } from "../src/core/identity-config";
import { readCommitIdentity, repairRepositoryIdentity } from "../src/core/git-config";
import { loadProfiles } from "../src/core/profiles";
import { globalGitConfigPath, managedGitConfigPath, sshConfigPath, type PathContext } from "../src/utils/paths";

const homes: string[] = [];
const personal: Profile = {
  name: "personal", host: "github.com", hostname: "github.com", user: "git", account: "personal",
  identity_file: "~/.ssh/personal", public_key_file: "~/.ssh/personal.pub", fingerprint: "",
  git_name: 'Personal "Developer" Name', git_email: "personal@example.com",
};
const work: Profile = { ...personal, name: "work", host: "git.company.com", hostname: "git.company.com", git_name: "Work Developer", git_email: "work@example.com", identity_file: "~/.ssh/work" };

async function context(): Promise<PathContext> {
  const homeDir = await mkdtemp(join(tmpdir(), "sshift-routing-"));
  homes.push(homeDir);
  return { homeDir };
}

function gitRunner(ctx: PathContext, cwd = ctx.homeDir) {
  return async (command: string, args: string[]) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
    const proc = Bun.spawn([command, ...args], { cwd, env: {
      ...env, HOME: ctx.homeDir, XDG_CONFIG_HOME: join(ctx.homeDir, ".config"),
      GIT_CONFIG_GLOBAL: globalGitConfigPath(ctx), GIT_CONFIG_NOSYSTEM: "1",
    }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { stdout, stderr, exitCode };
  };
}

async function repo(ctx: PathContext, name: string, remote: string) {
  const cwd = join(ctx.homeDir, name);
  await mkdir(cwd, { recursive: true });
  const run = gitRunner(ctx, cwd);
  expect((await run("git", ["init", "-q"])).exitCode).toBe(0);
  expect((await run("git", ["remote", "add", "origin", remote])).exitCode).toBe(0);
  return run;
}

afterEach(async () => { await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))); });

describe("automatic SSH and Git identity routing", () => {
  test("real commits use different authors per platform while unrelated repos keep the global identity", async () => {
    const ctx = await context();
    const original = '[user]\n  name = Original\n  email = original@example.com\n';
    await writeFile(globalGitConfigPath(ctx), original);
    await saveAndApplyProfiles([personal, work], "add platforms", ctx);
    for (const [name, url, expected] of [
      ["github", "git@github.com:someone/repo.git", personal],
      ["work", "ssh://git@git.company.com:2222/team/repo.git", work],
      ["https", "https://github.com/someone/repo.git", personal],
      ["host-only", "github.com:someone/repo.git", personal],
      ["other", "git@other.example.com:repo.git", { git_name: "Original", git_email: "original@example.com" }],
    ] as const) {
      const run = await repo(ctx, name, url);
      const author = await readCommitIdentity("AUTHOR", run);
      expect(author.name).toBe(expected.git_name);
      expect(author.email).toBe(expected.git_email);
      expect((await run("git", ["commit", "--allow-empty", "-qm", "identity check"])).exitCode).toBe(0);
      expect((await run("git", ["log", "-1", "--format=%an <%ae>"])).stdout.trim()).toBe(`${expected.git_name} <${expected.git_email}>`);
    }
    expect(await readFile(globalGitConfigPath(ctx), "utf8")).toStartWith(original);
  });

  test("editing an identity changes future commits immediately and leaves old commits intact", async () => {
    const ctx = await context();
    await saveAndApplyProfiles([personal, work], "add", ctx);
    const run = await repo(ctx, "personal", "git@github.com:personal/repo.git");
    await run("git", ["commit", "--allow-empty", "-qm", "before edit"]);
    await saveAndApplyProfiles([{ ...personal, git_email: "updated@example.com" }, work], "edit", ctx);
    expect((await readCommitIdentity("AUTHOR", run)).email).toBe("updated@example.com");
    expect((await run("git", ["log", "-1", "--format=%ae"])).stdout.trim()).toBe(personal.git_email!);
    const workRun = await repo(ctx, "work", "git@git.company.com:team/repo.git");
    expect((await readCommitIdentity("AUTHOR", workRun)).email).toBe(work.git_email!);
  });

  test("removal keeps unmanaged SSH settings and keys, disables author routing, and cleans the final include", async () => {
    const ctx = await context();
    await mkdir(join(ctx.homeDir, ".ssh"));
    const originalSsh = "Host company\n  HostName old.company.com\n  IdentityFile ~/.ssh/existing\n";
    const originalGit = "[user]\n  name = Original\n  email = original@example.com\n";
    await writeFile(sshConfigPath(ctx), originalSsh);
    await writeFile(globalGitConfigPath(ctx), originalGit);
    const key = join(ctx.homeDir, ".ssh/personal");
    await writeFile(key, "keep this key");
    await saveAndApplyProfiles([personal, work], "add", ctx);
    await saveAndApplyProfiles([work], "remove personal", ctx);
    expect(await readFile(key, "utf8")).toBe("keep this key");
    expect(await readFile(sshConfigPath(ctx), "utf8")).toContain(originalSsh);
    expect(await Bun.file(identityConfigPath(personal, ctx)).exists()).toBe(false);
    const run = await repo(ctx, "removed", "git@github.com:personal/repo.git");
    expect((await readCommitIdentity("AUTHOR", run)).email).toBe("original@example.com");
    await saveAndApplyProfiles([], "remove last", ctx);
    expect(await readFile(globalGitConfigPath(ctx), "utf8")).toBe(originalGit);
    expect(await readFile(sshConfigPath(ctx), "utf8")).toBe(originalSsh);
    expect(await Bun.file(managedGitConfigPath(ctx)).exists()).toBe(false);
  });

  test("write failures restore every modified file and the previous profile store", async () => {
    const ctx = await context();
    await saveAndApplyProfiles([personal], "initial", ctx);
    const sshBefore = await readFile(sshConfigPath(ctx), "utf8");
    const gitBefore = await readFile(globalGitConfigPath(ctx), "utf8");
    const routingBefore = await readFile(managedGitConfigPath(ctx), "utf8");
    await expect(saveAndApplyProfiles([personal, work], "failure", ctx, async (path, content) => {
      if (path === identityConfigPath(work, ctx)) throw new Error("simulated disk failure");
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, content);
    })).rejects.toThrow("simulated disk failure");
    expect(await readFile(sshConfigPath(ctx), "utf8")).toBe(sshBefore);
    expect(await readFile(globalGitConfigPath(ctx), "utf8")).toBe(gitBefore);
    expect(await readFile(managedGitConfigPath(ctx), "utf8")).toBe(routingBefore);
    expect((await loadProfiles(ctx)).profiles).toEqual([personal]);
    expect(await Bun.file(identityConfigPath(work, ctx)).exists()).toBe(false);
  });

  test("aliases isolate two accounts on the same platform and repository repair clears local overrides", async () => {
    const ctx = await context();
    const alias = { ...personal, name: "github-work", host: "github-work", git_name: "Company Name", git_email: "company@example.com" };
    await saveAndApplyProfiles([personal, alias], "second account", ctx);
    const run = await repo(ctx, "company", "git@github.com:org/repo.git");
    await run("git", ["config", "--local", "user.name", "Wrong Name"]);
    await run("git", ["config", "--local", "user.email", "wrong@example.com"]);
    expect((await readCommitIdentity("AUTHOR", run)).email).toBe("wrong@example.com");
    await repairRepositoryIdentity(alias, "git@github.com:org/repo.git", run, ctx);
    expect((await run("git", ["remote", "get-url", "origin"])).stdout.trim()).toBe("git@github-work:org/repo.git");
    expect(await readCommitIdentity("AUTHOR", run)).toEqual({ name: alias.git_name, email: alias.git_email });
    const personalRun = await repo(ctx, "personal", "git@github.com:personal/repo.git");
    expect((await readCommitIdentity("AUTHOR", personalRun)).email).toBe(personal.git_email!);
  });

  test("broken managed markers and unsupported Git versions stop before writing", async () => {
    expect(() => upsertGitInclude("# --- sshift git start ---\n", "/tmp/config")).toThrow("incomplete");
    await expect(requireIdentityGit(async () => ({ exitCode: 0, stdout: "git version 2.35.0", stderr: "" }))).rejects.toThrow("2.36");
  });

  test("multiple matching remotes can be repaired without freezing the author's email", async () => {
    const ctx = await context();
    await saveAndApplyProfiles([personal, work], "add", ctx);
    const run = await repo(ctx, "multi", "git@github.com:personal/repo.git");
    await run("git", ["remote", "add", "upstream", "git@git.company.com:team/repo.git"]);
    expect((await readCommitIdentity("AUTHOR", run)).email).toBe(work.git_email!);
    await repairRepositoryIdentity(personal, "git@github.com:personal/repo.git", run, ctx);
    expect((await readCommitIdentity("AUTHOR", run)).email).toBe(personal.git_email!);
    await saveAndApplyProfiles([{ ...personal, git_email: "new@example.com" }, work], "edit", ctx);
    expect((await readCommitIdentity("AUTHOR", run)).email).toBe("new@example.com");
  });

  test("failed repository repair restores the remote and local author settings", async () => {
    const ctx = await context();
    const alias = { ...personal, name: "work-alias", host: "github-work" };
    await saveAndApplyProfiles([personal, alias], "add", ctx);
    const run = await repo(ctx, "rollback", "git@github.com:personal/repo.git");
    await run("git", ["config", "--local", "user.name", "Existing Name"]);
    await run("git", ["config", "--local", "user.email", "existing@example.com"]);
    const config = join(ctx.homeDir, "rollback/.git/config");
    const before = await readFile(config, "utf8");
    await expect(repairRepositoryIdentity(alias, "git@github.com:personal/repo.git", async (command, args) => {
      if (args.includes("--unset-all") && args.includes("user.email")) return { exitCode: 1, stdout: "", stderr: "simulated config failure" };
      return run(command, args);
    }, ctx)).rejects.toThrow("simulated config failure");
    expect(await readFile(config, "utf8")).toBe(before);
  });

  test("native SSH keeps unmanaged option scope and reads keys whose paths contain spaces", async () => {
    const ctx = await context();
    await mkdir(join(ctx.homeDir, ".ssh"));
    const original = "\n# Existing settings\nUser existing-user\nHost other.example.com\n  HostName other.example.com\n";
    await writeFile(sshConfigPath(ctx), original);
    const keyProfile = { ...personal, identity_file: join(ctx.homeDir, ".ssh/key with spaces") };
    await saveAndApplyProfiles([keyProfile], "add", ctx);
    const run = gitRunner(ctx);
    const selected = await run("ssh", ["-G", "-F", sshConfigPath(ctx), "github.com"]);
    expect(selected.exitCode).toBe(0);
    expect(selected.stdout).toContain(`identityfile ${keyProfile.identity_file}`);
    expect(selected.stdout).toContain("user git\n");
    const unmanaged = await run("ssh", ["-G", "-F", sshConfigPath(ctx), "other.example.com"]);
    expect(unmanaged.stdout).toContain("user existing-user\n");
    await saveAndApplyProfiles([], "remove", ctx);
    expect(await readFile(sshConfigPath(ctx), "utf8")).toBe(original);
  });

  test("the CLI lists, diagnoses HTTPS author routing, and removes an identity", async () => {
    const ctx = await context();
    const key = join(ctx.homeDir, "key");
    await writeFile(key, "kept key");
    const profile = { ...personal, identity_file: key };
    await saveAndApplyProfiles([profile], "add", ctx);
    const run = await repo(ctx, "cli", "https://github.com/personal/repo.git");
    const entry = resolve(import.meta.dir, "../src/index.ts");
    const list = await run(process.execPath, [entry, "list"]);
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain("configured");
    expect(list.stdout).toContain(personal.git_email!);
    const diagnosis = await run(process.execPath, [entry, "doctor"]);
    expect(diagnosis.exitCode).toBe(0);
    expect(diagnosis.stdout).toContain("New commits use the expected name and email.");
    expect(diagnosis.stdout).toContain("This remote uses HTTPS.");
    const removal = await run(process.execPath, [entry, "rm", "personal", "--yes"]);
    expect(removal.exitCode).toBe(0);
    expect((await loadProfiles(ctx)).profiles).toEqual([]);
    expect(await readFile(key, "utf8")).toBe("kept key");
  });

  test("the add and edit wizards activate GitLab without disturbing an existing GitHub setup", async () => {
    const ctx = await context();
    await mkdir(join(ctx.homeDir, ".ssh"));
    const key = join(ctx.homeDir, ".ssh/id_work");
    const run = gitRunner(ctx);
    expect((await run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key])).exitCode).toBe(0);
    const originalSsh = "Host github.com\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_github\n";
    await writeFile(sshConfigPath(ctx), originalSsh);
    await writeFile(globalGitConfigPath(ctx), "[user]\n  name = Personal Name\n  email = personal@example.com\n");
    const harness = join(ctx.homeDir, "wizard.ts");
    await writeFile(harness, `
      import { mock } from "bun:test";
      const fields = ["git_email", "save"];
      mock.module(${JSON.stringify(import.meta.resolve("@inquirer/prompts"))}, () => ({
        confirm: async () => true,
        select: async (options) => {
          if (options.message === "Choose a Git platform") return "gitlab.com";
          if (options.message === "SSH key") return ${JSON.stringify(key)};
          if (options.message.startsWith("Edit ")) return fields.shift();
          throw new Error("Unexpected select: " + options.message);
        },
        input: async (options) => {
          if (options.message.startsWith("Platform account")) return "work";
          if (options.message === "Commit author name") return "Work Name";
          if (options.message === "Commit author email") return "work@example.com";
          if (options.message === "git_email") return "updated-work@example.com";
          throw new Error("Unexpected input: " + options.message);
        },
      }));
      const { addCommand } = await import(${JSON.stringify(resolve(import.meta.dir, "../src/commands/add.ts"))});
      await addCommand(process.argv[2] === "edit" ? { yes: true, edit: "gitlab-com-work" } : { yes: true });
    `);
    const added = await run(process.execPath, [harness]);
    expect(added.stderr).toBe("");
    expect(added.exitCode).toBe(0);
    expect((await loadProfiles(ctx)).profiles[0]?.git_email).toBe("work@example.com");
    expect(await readFile(sshConfigPath(ctx), "utf8")).toContain(originalSsh);
    const workRun = await repo(ctx, "work", "git@gitlab.com:team/repo.git");
    const personalRun = await repo(ctx, "personal", "git@github.com:personal/repo.git");
    expect((await readCommitIdentity("AUTHOR", workRun)).email).toBe("work@example.com");
    expect((await readCommitIdentity("AUTHOR", personalRun)).email).toBe("personal@example.com");
    const edited = await run(process.execPath, [harness, "edit"]);
    expect(edited.stderr).toBe("");
    expect(edited.exitCode).toBe(0);
    expect((await readCommitIdentity("AUTHOR", workRun)).email).toBe("updated-work@example.com");
    expect((await readCommitIdentity("AUTHOR", personalRun)).email).toBe("personal@example.com");
    expect(await readFile(sshConfigPath(ctx), "utf8")).toContain(originalSsh);
  });
});
