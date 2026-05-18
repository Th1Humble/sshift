import chalk from "chalk";
import { scanEnvironment } from "../core/scan";
import { createTable } from "../utils/table";

export async function scanCommand(): Promise<void> {
  const scan = await scanEnvironment();

  console.log(chalk.bold("Environment"));
  console.log(`  ssh: ${scan.ssh_path ? `${scan.ssh_path} ${chalk.green("✓")}` : chalk.red("missing")}`);
  console.log(`  git: ${scan.git_path ? `${scan.git_path} ${chalk.green("✓")}` : chalk.red("missing")}`);
  console.log("");

  console.log(chalk.bold(`SSH Keys (${scan.public_keys.length} found)`));
  if (scan.public_keys.length === 0) {
    console.log("  none");
  } else {
    const table = createTable(["Key", "Fingerprint", "Comment"]);
    for (const key of scan.public_keys) {
      table.push([key.identity_file, key.fingerprint, key.comment]);
    }
    console.log(table.toString());
  }
  console.log("");

  console.log(chalk.bold("SSH Config Hosts"));
  if (scan.ssh_hosts.length === 0) {
    console.log("  none");
  } else {
    const table = createTable(["Host", "IdentityFile", "Managed"]);
    for (const host of scan.ssh_hosts) {
      table.push([host.host, host.identity_file ?? "", host.managed ? "yes" : "no"]);
    }
    console.log(table.toString());
  }
  console.log("");

  console.log(chalk.bold("Git Global Identity"));
  console.log(`  user.name:  ${scan.git_global_identity.name ?? "(unset)"}`);
  console.log(`  user.email: ${scan.git_global_identity.email ?? "(unset)"}`);
  console.log("");

  console.log(chalk.bold(`sshift Profiles (${scan.profiles.length})`));
  if (scan.profiles.length === 0) {
    console.log("  none");
  } else {
    const table = createTable(["Name", "Host", "Account", "Key"]);
    for (const profile of scan.profiles) {
      table.push([profile.name, profile.host, profile.account, profile.identity_file]);
    }
    console.log(table.toString());
  }
}
