#!/usr/bin/env bun

import { Command } from "commander";
import { addCommand } from "./commands/add";
import { applyCommand } from "./commands/apply";
import { bindCommand } from "./commands/bind";
import { doctorCommand } from "./commands/doctor";
import { profileListCommand } from "./commands/profile-list";
import { profileRemoveCommand } from "./commands/profile-rm";
import { rollbackCommand } from "./commands/rollback";
import { scanCommand } from "./commands/scan";

const program = new Command();

program
  .name("sshift")
  .description("Use the right SSH key for every Git repo.")
  .version("0.1.0");

program
  .command("add")
  .description("Add one or more Git SSH identities")
  .option("-y, --yes", "Skip final apply confirmation")
  .action(addCommand);

program
  .command("scan")
  .description("Scan local SSH and Git identity configuration")
  .action(scanCommand);

program
  .command("apply")
  .description("Regenerate the sshift managed SSH config block from profiles")
  .option("--preview", "Print the managed SSH config block without writing")
  .option("-y, --yes", "Skip confirmation")
  .action(applyCommand);

program
  .command("rollback")
  .description("Restore SSH config from a previous sshift backup")
  .option("--backup <path>", "Backup file to restore")
  .option("-y, --yes", "Skip confirmation")
  .action(rollbackCommand);

program
  .command("doctor")
  .description("Diagnose the current Git repository SSH identity")
  .action(doctorCommand);

program
  .command("bind")
  .argument("<profile>", "Profile name")
  .description("Set the current repository Git author identity from a profile")
  .option("-y, --yes", "Skip confirmation")
  .action(bindCommand);

const profile = program.command("profile").description("Manage existing sshift profiles");

profile.command("list").description("List configured profiles").action(profileListCommand);

profile
  .command("rm")
  .argument("<name>", "Profile name")
  .description("Remove a profile without deleting SSH key files")
  .option("-y, --yes", "Skip confirmation")
  .action(profileRemoveCommand);

program.exitOverride();

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "commander.helpDisplayed") {
    process.exit(0);
  }
  if (error instanceof Error && "exitCode" in error) {
    process.exit(Number(error.exitCode));
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
