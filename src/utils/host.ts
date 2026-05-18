export interface HostTemplate {
  label: string;
  host: string;
  hostname: string;
  user: string;
}

const HOST_TEMPLATES: Record<string, HostTemplate> = {
  github: {
    label: "GitHub",
    host: "github.com",
    hostname: "github.com",
    user: "git",
  },
  gitlab: {
    label: "GitLab",
    host: "gitlab.com",
    hostname: "gitlab.com",
    user: "git",
  },
};

export function getHostTemplate(name: string): HostTemplate | undefined {
  return HOST_TEMPLATES[name];
}

export function hostTemplateChoices(): HostTemplate[] {
  return Object.values(HOST_TEMPLATES);
}

export function defaultProfileName(host: string, account: string): string {
  return `${slug(host)}-${slug(account)}`;
}

export function defaultKeyName(host: string): string {
  return `id_ed25519_${slug(host).replaceAll("-", "_")}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
