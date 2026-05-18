# sshift

[中文文档](./README.zh-CN.md)

Use the right SSH key for every Git repo.

sshift helps developers manage multiple SSH keys across GitHub, GitLab, and custom Git hosts. It writes a managed block into `~/.ssh/config` so native `git clone`, `git pull`, and `git push` just work — no wrappers, no agents, no runtime overhead.

sshift never uploads, stores, or reads your private SSH key content.

## Why

Many developers work with more than one Git host:

- A company Git server with a company SSH key
- A personal GitHub account with a personal SSH key
- An internal Git server with yet another key

OpenSSH already supports routing different hosts to different keys via `~/.ssh/config`. But the configuration is fiddly, easy to get wrong, and painful to debug when `Permission denied (publickey)` appears with no further explanation.

sshift makes the safe path easy:

1. Add a profile (host + account + key)
2. sshift writes the SSH config for you
3. You keep using `git clone git@github.com:...` as normal

## Install

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | sh
```

The installer resolves the latest [GitHub Release](https://github.com/Th1Humble/sshift/releases), downloads that fixed-version binary, verifies its checksum, and installs it.

To pin a version:

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | SSHIFT_VERSION=v0.1.0 sh
```

Or download a standalone binary from [GitHub Releases](https://github.com/Th1Humble/sshift/releases):

```bash
tar -xzf sshift-v0.1.0-darwin-arm64.tar.gz
chmod +x sshift
sudo mv sshift /usr/local/bin/sshift
```

## Quick Start

```bash
# New computer: add your first identity
sshift add

# Check what sshift sees
sshift scan

# Diagnose a repo
cd ~/my-project
sshift doctor
```

## Commands

| Command | Description |
|---------|-------------|
| `sshift add` | Interactively add one or more SSH identities |
| `sshift scan` | Scan local SSH keys, config, and Git identity |
| `sshift apply` | Regenerate the managed SSH config block from profiles |
| `sshift doctor` | Diagnose SSH identity for the current Git repo |
| `sshift bind <profile>` | Set repo-local Git author from a profile |
| `sshift rollback` | Restore SSH config from a previous backup |
| `sshift profile list` | List all configured profiles |
| `sshift profile rm <name>` | Remove a profile |

### `sshift add`

Interactive flow to add SSH identities:

1. Choose a host template (GitHub, GitLab, or custom)
2. Enter your account name
3. Generate a new SSH key or select an existing one
4. Preview the managed SSH config block
5. Optionally apply it immediately

You can add multiple profiles in one session — sshift will ask "Add another?" after each one.

```bash
sshift add          # interactive
sshift add --yes    # skip the final apply confirmation
```

### `sshift scan`

Shows the current state of your SSH and Git environment:

- Available SSH keys and their fingerprints
- Existing `~/.ssh/config` host entries (managed and unmanaged)
- Global Git identity (`user.name` / `user.email`)
- Configured sshift profiles

```bash
sshift scan
```

### `sshift apply`

Regenerates the managed SSH config block from all saved profiles and writes it to `~/.ssh/config`. A backup is created before every write.

```bash
sshift apply            # confirm before writing
sshift apply --preview  # print the block without writing
sshift apply --yes      # write without confirmation
```

If an unmanaged `Host` entry in your SSH config conflicts with a profile host, sshift warns you but does not overwrite it.

### `sshift doctor`

Diagnoses the current Git repository:

- Reads the `origin` remote URL
- Matches it to a configured profile
- Checks which key OpenSSH would actually use (`ssh -G`)
- Tests live SSH authentication (`ssh -T`)
- Compares local Git identity against the profile

```bash
cd ~/my-project
sshift doctor
```

Example output:

```
Repository
  origin: git@github.com:th1humble/sshift.git
  host:   github.com

Matched Profile
  name: github-com-th1humble
  key:  ~/.ssh/id_ed25519_github_com

Git Identity
  local:  (unset) <(unset)>
  global: Th1Humble <mjsdbd921@gmail.com>

OpenSSH Resolution
  identityfile: ~/.ssh/id_ed25519_github_com

SSH Auth
  ok: Authenticated as Th1Humble
```

### `sshift bind <profile>`

Sets repo-local `user.name` and `user.email` from a profile. Useful when you want different commit identities per repo.

The profile must have `git_name` and `git_email` configured. You can add these later by editing `~/.config/sshift/profiles.toml` directly.

```bash
sshift bind github-com-th1humble
sshift bind github-com-th1humble --yes   # skip confirmation
```

### `sshift rollback`

Restores `~/.ssh/config` from the most recent backup.

```bash
sshift rollback                    # restore latest backup
sshift rollback --backup <path>    # restore a specific backup file
sshift rollback --yes              # skip confirmation
```

### `sshift profile list`

Lists all configured profiles in a table.

```bash
sshift profile list
```

### `sshift profile rm <name>`

Removes a profile and regenerates the SSH config block. Does **not** delete the SSH key files.

```bash
sshift profile rm github-com-th1humble
sshift profile rm github-com-th1humble --yes   # skip confirmation
```

## Scenarios

### New Computer

Starting from scratch with no SSH keys configured:

```bash
sshift add
# → Choose GitHub, enter account, generate key
# → Copy the printed public key to GitHub Settings → SSH Keys
# → Choose "Add another?" → Yes
# → Choose GitLab, enter account, generate key
# → Copy public key to GitLab
# → Choose "Add another?" → No
# → Apply managed SSH config block

# Verify
sshift doctor
```

### Existing Work Computer

You already have a company SSH key and Git config. You want to add a personal GitHub identity without breaking anything:

```bash
# See what's already configured
sshift scan

# Add GitHub identity
sshift add
# → sshift shows your existing profiles first
# → Add GitHub profile with a new key
# → sshift writes ONLY its managed block, leaving your existing config untouched

# Verify both work
cd ~/work-project && sshift doctor
cd ~/personal-project && sshift doctor
```

### Daily Use

After setup, sshift is invisible. You use Git normally:

```bash
git clone git@github.com:user/repo.git    # uses GitHub key
git clone git@gitlab.com:team/project.git  # uses GitLab key
git push                                    # correct key selected by host
```

OpenSSH reads `~/.ssh/config` and routes each host to the right key. sshift already wrote the config — it doesn't need to run.

### Something Broke

```bash
# Diagnose
sshift doctor
# → Shows which key SSH would use, whether auth succeeds

# If sshift config is the problem, roll back
sshift rollback
```

## How It Works

### Managed SSH Config Block

sshift writes a clearly delimited block at the top of `~/.ssh/config`:

```sshconfig
# --- sshift managed start ---
# profile: github-com-th1humble
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github_com
  IdentitiesOnly yes

# profile: gitlab-com-majian
Host gitlab.com
  HostName gitlab.com
  User git
  IdentityFile ~/.ssh/id_ed25519_gitlab_com
  IdentitiesOnly yes
# --- sshift managed end ---
```

Everything outside the managed block is preserved verbatim. sshift never touches unmanaged content.

### Profile Storage

Profiles are stored in `~/.config/sshift/profiles.toml`:

```toml
[[profiles]]
name = "github-com-th1humble"
host = "github.com"
hostname = "github.com"
user = "git"
account = "th1humble"
identity_file = "~/.ssh/id_ed25519_github_com"
public_key_file = "~/.ssh/id_ed25519_github_com.pub"
fingerprint = "SHA256:..."
```

### Backups

Every time sshift writes to `~/.ssh/config`, it first copies the current file to:

```
~/.config/sshift/backups/ssh_config.<timestamp>
```

Use `sshift rollback` to restore any backup.

## Safety Guarantees

- Never uploads SSH keys
- Never reads private key file content
- Never stores private key content — only records file paths
- Fingerprints are derived from public keys only
- Only edits its own managed block in SSH config
- Never rewrites unmanaged SSH config entries
- Creates a backup before every write
- All managed changes are reversible via `sshift rollback`
- Uses native OpenSSH (`ssh-keygen`, `ssh -T`, `ssh -G`)
- Uses native Git (`git config`, `git remote`)

## Limitations (v1)

- **One profile per host.** Two GitHub accounts on the same `github.com` host require host aliases, which is planned for v2.
- **No SSH agent management.** sshift configures `IdentityFile` and `IdentitiesOnly` — it does not start or manage `ssh-agent`.
- **No automatic Git identity switching.** Use `sshift bind` manually, or configure `includeIf` in your `~/.gitconfig` yourself.

## Uninstall

```bash
sudo rm -f /usr/local/bin/sshift

# Optionally remove sshift config and backups
rm -rf ~/.config/sshift

# Remove the managed block from ~/.ssh/config manually,
# or restore a pre-sshift backup:
# sshift rollback (before uninstalling)
```

## License

MIT
