import { confirm } from "@inquirer/prompts";
import { setLocalGitIdentity } from "../core/git-config";
import { loadProfiles } from "../core/profiles";
import { formatKeyValue, statusOk } from "../utils/output";

interface BindOptions {
  yes?: boolean;
}

export async function bindCommand(profileName: string, options: BindOptions): Promise<void> {
  const store = await loadProfiles();
  const profile = store.profiles.find((candidate) => candidate.name === profileName);

  if (!profile) {
    throw new Error(`Profile not found: ${profileName}`);
  }

  if (!profile.git_name || !profile.git_email) {
    throw new Error(`Profile ${profileName} does not have git_name and git_email configured.`);
  }

  console.log(`This will set the current repository Git identity to:`);
  console.log(formatKeyValue("user.name", profile.git_name));
  console.log(formatKeyValue("user.email", profile.git_email));

  const shouldBind =
    options.yes ??
    (await confirm({
      message: "Write this identity to the current repository?",
      default: false,
    }));

  if (!shouldBind) {
    console.log("Cancelled.");
    return;
  }

  await setLocalGitIdentity({ name: profile.git_name, email: profile.git_email });
  console.log(statusOk(`Bound current repository to profile: ${profile.name}`));
}
