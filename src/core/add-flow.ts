import type { Profile } from "../types";

export interface AddSessionOptions {
  createProfile: () => Promise<Profile>;
  confirmAnother: (profiles: Profile[]) => Promise<boolean>;
  onProfilesChanged: (profiles: Profile[]) => Promise<void>;
}

export async function collectAddSessionProfiles(options: AddSessionOptions): Promise<Profile[]> {
  const profiles: Profile[] = [];

  do {
    profiles.push(await options.createProfile());
    await options.onProfilesChanged(profiles);
  } while (await options.confirmAnother(profiles));

  return profiles;
}
