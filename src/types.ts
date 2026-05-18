export interface Profile {
  name: string;
  host: string;
  hostname: string;
  user: string;
  account: string;
  identity_file: string;
  public_key_file: string;
  fingerprint: string;
  git_name?: string;
  git_email?: string;
}

export interface ProfilesStore {
  profiles: Profile[];
}

export interface SshConfigBlock {
  profile_name: string;
  host: string;
  hostname: string;
  user: string;
  identity_file: string;
  identities_only: boolean;
}

export interface BackupRecord {
  timestamp: string;
  file_path: string;
  reason: string;
}

export interface PublicKeyInfo {
  public_key_file: string;
  identity_file: string;
  fingerprint: string;
  comment: string;
}

export interface SshHostEntry {
  host: string;
  hostname?: string;
  user?: string;
  identity_file?: string;
  managed: boolean;
}

export interface GitIdentity {
  name?: string;
  email?: string;
}

export interface ScanResult {
  ssh_path?: string;
  git_path?: string;
  public_keys: PublicKeyInfo[];
  ssh_hosts: SshHostEntry[];
  git_global_identity: GitIdentity;
  profiles: Profile[];
}
