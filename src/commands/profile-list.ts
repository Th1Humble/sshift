import { loadProfiles } from "../core/profiles";
import { createTable } from "../utils/table";
import type { Profile } from "../types";
import { stat } from "node:fs/promises";
import { identityConfigPath, quoteGit, readOptionalFile, renderGitRouting } from "../core/identity-config";
import { renderManagedBlock } from "../core/ssh-config";
import { globalGitConfigPath, managedGitConfigPath, sshConfigPath } from "../utils/paths";

export async function profileListCommand(): Promise<void> {
  const store = await loadProfiles();

  if (store.profiles.length === 0) {
    console.log("No profiles configured.");
    return;
  }

  const [ssh, git, routing] = await Promise.all([
    readOptionalFile(sshConfigPath()), readOptionalFile(globalGitConfigPath()), readOptionalFile(managedGitConfigPath()),
  ]);
  const routingActive = ssh?.includes(renderManagedBlock(store.profiles)) && git?.includes(`path = ${quoteGit(managedGitConfigPath())}`) && routing === renderGitRouting(store.profiles);
  const statuses: Record<string, string> = {};
  for (const profile of store.profiles) {
    const keyExists = await stat(profile.identity_file.replace(/^~\//, `${process.env.HOME}/`)).then((info) => info.isFile()).catch(() => false);
    const identity = await readOptionalFile(identityConfigPath(profile));
    const authorActive = identity === `[user]\n  name = ${quoteGit(profile.git_name ?? "")}\n  email = ${quoteGit(profile.git_email ?? "")}\n`;
    statuses[profile.name] = !profile.git_name || !profile.git_email ? "needs author" : !keyExists ? "key missing" : routingActive && authorActive ? "configured" : "needs repair";
  }
  printProfilesTable(store.profiles, statuses);
  console.log("Edit: sshift add --edit <name>    Remove: sshift rm <name>");
}

export function printProfilesTable(profiles: Profile[], statuses?: Record<string, string>): void {
  const table = createTable(["Name", "Git host / scope", "Key", "Commit author", "Status"]);

  for (const profile of profiles) {
    table.push([
      profile.name,
      profile.host,
      profile.identity_file,
      `${profile.git_name ?? "(unset)"} <${profile.git_email ?? "(unset)"}>`,
      statuses?.[profile.name] ?? (!profile.git_name || !profile.git_email ? "needs author" : "saved"),
    ]);
  }

  console.log(table.toString());
}
