# sshift

[中文文档](./README.zh-CN.md)

**The right key. The right commit author.**

Different platforms. Different identities.

Set up each Git identity once. sshift handles SSH keys and commit author settings for matching repositories, so you can keep using Git as usual.

## What sshift solves

- **Add another Git host without starting over.** Already using GitHub? Add GitLab or your company's Git server without changing what already works.
- **Use the right commit identity.** Personal projects use your personal email. Work repositories use your work email. No need to switch Git configs before every commit.
- **Use the right SSH key.** Each Git host gets its own SSH key. Need multiple accounts on the same platform? Use separate SSH aliases.

sshift never uploads, stores, or reads your private SSH key content.

## Install

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | sh
```

The installer resolves the latest [GitHub Release](https://github.com/Th1Humble/sshift/releases), downloads that fixed-version binary, verifies its checksum, and installs it to `~/.local/bin` by default.

macOS and Linux are supported. Windows is not supported yet.

Make sure `~/.local/bin` is on your `PATH`:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

To install somewhere else:

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | INSTALL_DIR=/usr/local/bin sh
```

To pin a version:

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | SSHIFT_VERSION=v0.2.0 sh
```

Or download a standalone binary from [GitHub Releases](https://github.com/Th1Humble/sshift/releases):

```bash
tar -xzf sshift-v0.2.0-darwin-arm64.tar.gz
chmod +x sshift
sudo mv sshift /usr/local/bin/sshift
```

## Quick Start

```bash
sshift add                       # Add GitHub, GitLab, or another platform
sshift list                      # Inspect identities and configuration status
sshift add --edit gitlab-com-work # Change an existing identity
sshift doctor                    # Check the current repo's actual key and author
sshift rm gitlab-com-work         # Remove routing, keep SSH key files
```

The add wizard asks for the platform, account, commit author name/email, and an existing or new SSH key. It shows the public key and registration link, then activates SSH and automatic Git author routing together after confirmation.

Register the public key with your platform, then use normal `git clone`, `git pull`, `git commit`, and `git push` commands. No separate apply or bind step is required.

## Four Commands

| Command | Purpose |
|---------|---------|
| `sshift add` | Add an identity and activate SSH/Git routing |
| `sshift add --edit <name>` | Edit selected fields and activate changes |
| `sshift list` | Show identities, Git hosts, commit authors, and configuration status |
| `sshift rm <name>` | Remove an identity and its routing without deleting SSH keys |
| `sshift doctor` | Check the actual SSH key, author, and committer in the current repo |
| `sshift doctor --fix` | Regenerate managed rules and help repair repository identity |

`add --yes` skips the final activation confirmation; other wizard questions remain interactive. `rm --yes` skips removal confirmation.

### Editing

The edit wizard displays existing values. Select the fields to change: commit name/email, platform hostname, SSH host/alias, platform account, SSH user, or key. Email changes apply to future commits in matching repositories; existing commits retain their original authors.

Older profiles without a commit name/email can be completed with `sshift add --edit <name>`, without editing TOML manually.

### Diagnosis and Repair

```bash
cd ~/project
sshift doctor
sshift doctor --fix
```

Doctor reads Git's actual author and committer identities, shows the SSH keys OpenSSH resolves, and tests platform authentication.

Existing repository-local or worktree `user.name`/`user.email` values override automatic routing. Add offers to migrate the current repository when needed; use `doctor --fix` in other existing repositories to clear these overrides after confirmation. Other repository settings are preserved.

`GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `git -c`, and other Git includes may still override the rules. Doctor reports mismatches and configuration sources; it does not edit your shell environment.

## Automatic Identity Selection

SSH keys select the account for fetch/push authentication. Git author names and emails select the identity written into new commits. A platform account name need not be the same as your commit author name.

sshift maintains a block in `~/.ssh/config`, adds a managed include entry to global Git configuration, and generates native remote-URL conditions:

```text
git@github.com:owner/repo.git
→ GitHub key + personal commit name/email

git@git.company.com:team/repo.git
→ Company key + company commit name/email
```

Author routing supports SCP-style SSH, SSH URLs with ports, and HTTPS URLs. HTTPS authentication uses HTTPS credentials rather than SSH keys.

Rules apply to existing repositories and future clones. No background process, hooks, or Git wrapper is needed. Existing global name/email fields remain intact, and unrelated repositories retain their original identity.

### Multiple Accounts on One Platform

When a host already has an identity, the wizard creates a separate SSH alias:

```bash
git clone git@github.com:personal/repo.git
git clone git@github.com-work:company/repo.git
```

Each host selects its own key and author. The alias is chosen in the wizard. Add can update the current repository's origin when adopting the new identity; `doctor --fix` can select an existing alias for other repositories.

For existing unmanaged Host entries, the wizard offers a separate alias by default to preserve routing. You may explicitly choose to prefer the selected key on that host while preserving the original config text. Additional candidate keys may remain; doctor reports them.

## Configuration and Recovery

Identities live in `~/.config/sshift/profiles.toml`; generated Git rules live in `git.conf` and `identities/` alongside it.

Before add, edit, remove, or repair, relevant files are backed up under `~/.config/sshift/backups/`. SSH configuration, Git routing, and profile storage are updated together. Failed writes automatically restore the operation's changes. Removing the last identity cleans up the managed SSH block and Git include entry.

Repository repairs have their own backup and failure recovery. Backups contain configuration, never private key contents; successful operations retain local historical backups.

## Requirements and Boundaries

- macOS or Linux; Git 2.36 or newer for automatic author selection.
- Git's remote condition checks every remote. A repository with remotes matching multiple identities can match multiple author rules. Doctor checks the actual result; `doctor --fix` can add a repository rule for the selected identity. Recheck after changing remotes.
- Multiple accounts on one platform use SSH aliases. HTTPS URLs cannot use SSH aliases to distinguish accounts.
- No SSH agent management or rewriting existing commits.
- New keys use ed25519. Existing key files are never overwritten; native OpenSSH handles private keys.

## Uninstall

Run `sshift list`, then `sshift rm <name>` for each managed identity. Removing the final identity also removes managed routing entry points while keeping SSH key files.

Delete the installed `sshift` binary. Optionally remove `~/.config/sshift` and its backups.

## License

MIT
