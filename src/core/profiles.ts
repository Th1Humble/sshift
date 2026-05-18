import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse, stringify } from "smol-toml";
import type { Profile, ProfilesStore } from "../types";
import { profilesPath, type PathContext } from "../utils/paths";

interface TomlProfiles {
  profiles?: Profile[];
}

export async function loadProfiles(ctx?: PathContext): Promise<ProfilesStore> {
  const path = profilesPath(ctx);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = parse(raw) as TomlProfiles;
    return { profiles: parsed.profiles ?? [] };
  } catch (error) {
    if (isNotFound(error)) {
      return { profiles: [] };
    }
    throw error;
  }
}

export async function saveProfiles(store: ProfilesStore, ctx?: PathContext): Promise<void> {
  const path = profilesPath(ctx);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringify(store), "utf8");
}

export async function addProfile(profile: Profile, ctx?: PathContext): Promise<void> {
  const store = await loadProfiles(ctx);

  if (store.profiles.some((existing) => existing.name === profile.name)) {
    throw new Error(`Profile already exists: ${profile.name}`);
  }

  if (store.profiles.some((existing) => existing.host === profile.host)) {
    throw new Error(`Host already has a profile in v1: ${profile.host}`);
  }

  await saveProfiles({ profiles: [...store.profiles, profile] }, ctx);
}

export async function removeProfile(name: string, ctx?: PathContext): Promise<void> {
  const store = await loadProfiles(ctx);
  await saveProfiles(
    { profiles: store.profiles.filter((profile) => profile.name !== name) },
    ctx,
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
