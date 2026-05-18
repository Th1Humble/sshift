import { confirm } from "@inquirer/prompts";
import { loadProfiles, removeProfile } from "../core/profiles";
import { applyProfilesToSshConfig } from "../core/ssh-config";

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

  await removeProfile(name);
  const nextStore = await loadProfiles();
  const backup = await applyProfilesToSshConfig(
    nextStore.profiles,
    `profile remove ${name}`,
  );

  console.log(`Removed profile: ${name}`);
  console.log(`SSH key left untouched: ${profile.identity_file}`);
  console.log(`Backup: ${backup.file_path}`);
}
