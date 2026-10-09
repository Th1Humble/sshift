#!/usr/bin/env bun

import { Command } from "commander";
import { addCommand } from "./commands/add";
import { doctorCommand } from "./commands/doctor";
import { profileListCommand } from "./commands/profile-list";
import { profileRemoveCommand } from "./commands/profile-rm";
import { CLI_VERSION } from "./version";

const program = new Command();
program.name("sshift").description("Use the right SSH key and commit author for every Git repo.").version(CLI_VERSION);
program.command("add")
  .description("Add an identity and automatically configure SSH and Git")
  .option("--edit <name>", "Modify an existing identity")
  .option("-y, --yes", "Skip the final activation confirmation")
  .action(addCommand);
program.command("doctor")
  .description("Check the current repository SSH key and actual commit author")
  .option("--fix", "Repair managed routing and current repository identity")
  .action(doctorCommand);
program.command("list").description("List identities and configuration status").action(profileListCommand);
program.command("rm")
  .argument("<name>", "Identity name")
  .description("Remove an identity and its routing without deleting SSH keys")
  .option("-y, --yes", "Skip confirmation")
  .action(profileRemoveCommand);
program.exitOverride();
try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "commander.helpDisplayed") process.exit(0);
  if (error instanceof Error && "exitCode" in error) process.exit(Number(error.exitCode));
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
