import { loadProfiles } from "../core/profiles";
import { createTable } from "../utils/table";
import type { Profile } from "../types";

export async function profileListCommand(): Promise<void> {
  const store = await loadProfiles();

  if (store.profiles.length === 0) {
    console.log("No profiles configured.");
    return;
  }

  printProfilesTable(store.profiles);
}

export function printProfilesTable(profiles: Profile[]): void {
  const table = createTable(["Name", "Host", "Account", "Key", "Git Email"]);

  for (const profile of profiles) {
    table.push([
      profile.name,
      profile.host,
      profile.account,
      profile.identity_file,
      profile.git_email ?? "",
    ]);
  }

  console.log(table.toString());
}
