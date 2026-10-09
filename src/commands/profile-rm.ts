import { confirm } from "@inquirer/prompts";
import { loadProfiles, removeProfile } from "../core/profiles";
import { applyProfilesToSshConfig } from "../core/ssh-config";
import { saveAndApplyProfiles } from "../core/identity-config";
import { formatKeyValue, statusOk } from "../utils/output";

interface ProfileRemoveOptions {
  yes?: boolean;
}

export async function profileRemoveCommand(
  name: string,
  options: ProfileRemoveOptions,
): Promise<void> {
  const store = await loadProfiles();
  const profile = store.profiles.find((candidate) => candidate.name === name);

  if (!profile) {
    throw new Error(`Profile not found: ${name}`);
  }

  const shouldRemove =
    options.yes ??
    (await confirm({
      message: `Remove profile ${name}? SSH key files will not be deleted.`,
      default: false,
    }));

  if (!shouldRemove) {
    console.log("Cancelled.");
    return;
  }

  const backup = await saveAndApplyProfiles(store.profiles.filter((item) => item.name !== name), `remove ${name}`);

  console.log(statusOk(`Removed profile: ${name}`));
  console.log(formatKeyValue("Key kept", profile.identity_file));
  console.log(formatKeyValue("Backup", backup));
}
