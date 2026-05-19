import { confirm } from "@inquirer/prompts";
import { readFile } from "node:fs/promises";
import { loadProfiles } from "../core/profiles";
import {
  applyProfilesToSshConfig,
  detectUnmanagedHostConflicts,
  renderManagedBlock,
} from "../core/ssh-config";
import { formatKeyValue, statusOk, statusWarning } from "../utils/output";
import { sshConfigPath } from "../utils/paths";

interface ApplyOptions {
  preview?: boolean;
  yes?: boolean;
}

export async function applyCommand(options: ApplyOptions): Promise<void> {
  const store = await loadProfiles();
  const block = renderManagedBlock(store.profiles);
  const existing = await readFile(sshConfigPath(), "utf8").catch(() => "");
  const conflicts = detectUnmanagedHostConflicts(existing, store.profiles);

  if (options.preview) {
    console.log(block);
    return;
  }

  if (conflicts.length > 0) {
    console.log(statusWarning("Warning: unmanaged SSH config already contains matching Git host entries:"));
    for (const conflict of conflicts) {
      console.log(`  - ${conflict}`);
    }
    console.log("sshift will not edit unmanaged blocks. Verify with `sshift doctor` after apply.");
    console.log("");
  }

  console.log("Managed SSH config block to apply:");
  console.log(block);

  const shouldApply =
    options.yes ??
    (await confirm({
      message: "Apply this managed block to ~/.ssh/config?",
      default: false,
    }));

  if (!shouldApply) {
    console.log("Cancelled.");
    return;
  }

  const backup = await applyProfilesToSshConfig(store.profiles, "sshift apply");

  console.log(statusOk(`Applied ${store.profiles.length} profile(s) to SSH config.`));
  console.log(formatKeyValue("Backup", backup.file_path));
}
