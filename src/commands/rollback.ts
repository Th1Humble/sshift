import { confirm } from "@inquirer/prompts";
import { latestBackup, restoreBackup } from "../core/backup";
import { formatKeyValue, statusOk } from "../utils/output";

interface RollbackOptions {
  backup?: string;
  yes?: boolean;
}

export async function rollbackCommand(options: RollbackOptions): Promise<void> {
  const backup = options.backup ?? (await latestBackup());

  if (!backup) {
    console.log("No SSH config backups found.");
    return;
  }

  const shouldRestore =
    options.yes ??
    (await confirm({
      message: `Restore SSH config backup ${backup}?`,
      default: false,
    }));

  if (!shouldRestore) {
    console.log("Cancelled.");
    return;
  }

  await restoreBackup(backup);
  console.log(statusOk("Restored SSH config."));
  console.log(formatKeyValue("Backup", backup));
}
