import { confirm } from "@inquirer/prompts";
import { readFile } from "node:fs/promises";
import { collectAddSessionProfiles } from "../core/add-flow";
import { addProfile, loadProfiles } from "../core/profiles";
import { applyProfilesToSshConfig, renderManagedBlock } from "../core/ssh-config";
import { buildProfile } from "./profile-builder";
import { printProfilesTable } from "./profile-list";

interface AddOptions {
  yes?: boolean;
}

export async function addCommand(options: AddOptions): Promise<void> {
  const existingStore = await loadProfiles();
  if (existingStore.profiles.length > 0) {
    console.log("Existing profiles:");
    printProfilesTable(existingStore.profiles);
    console.log("");
  }

  const addedProfiles = await collectAddSessionProfiles({
    createProfile: () => buildProfile({}),
    onProfilesChanged: async (sessionProfiles) => {
      const latest = sessionProfiles.at(-1);
      if (latest) {
        await addProfile(latest);
        await printAddedProfile(latest);
      }
      const store = await loadProfiles();
      console.log("");
      console.log("Profiles configured:");
      printProfilesTable(store.profiles);
      console.log("");
    },
    confirmAnother: () =>
      confirm({
        message: "Add another Git identity?",
        default: true,
      }),
  });

  const store = await loadProfiles();
  const block = renderManagedBlock(store.profiles);

  console.log("Managed SSH config block to apply:");
  console.log(block);

  const shouldApply =
    options.yes ??
    (await confirm({
      message: "Apply this managed block to ~/.ssh/config now?",
      default: true,
    }));

  if (!shouldApply) {
    console.log("Profiles saved. Run `sshift apply` when ready.");
    return;
  }

  const backup = await applyProfilesToSshConfig(store.profiles, "sshift add");
  console.log(`Added ${addedProfiles.length} profile(s).`);
  console.log(`Backup: ${backup.file_path}`);
}

async function printAddedProfile(profile: Awaited<ReturnType<typeof buildProfile>>): Promise<void> {
  console.log(`Added profile: ${profile.name}`);
  console.log(`Host: ${profile.host}`);
  console.log(`Key: ${profile.identity_file}`);
  console.log(`Public key: ${profile.public_key_file}`);
  if (profile.fingerprint) {
    console.log(`Fingerprint: ${profile.fingerprint}`);
  }

  const publicKey = await readFile(profile.public_key_file, "utf8").catch(() => "");
  if (publicKey.trim()) {
    console.log("");
    console.log("Add this public key to your Git host:");
    console.log(publicKey.trim());
  } else {
    console.log("");
    console.log("Public key content could not be read. Add the .pub file manually.");
  }
}
