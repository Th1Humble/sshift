# sshift

[English](./README.md)

**不同平台，用不同身份。**

配置一次身份，sshift 就会为匹配的仓库使用对应的 SSH key、提交姓名和邮箱。之后照常使用 Git。

## 解决什么问题

- **添加平台，不用重新配置。** GitHub 已经配好了？直接添加 GitLab 或公司 Git 服务，不用重新折腾现有配置。
- **使用正确的提交身份。** 个人项目用私人邮箱，公司项目用工作邮箱。不用每次提交前手动切换 Git 配置。
- **使用对应的 SSH key。** 不同 Git 平台使用各自的 SSH key。同一个平台有多个账号，也可以通过 SSH 别名区分。

sshift 不上传、不存储、不读取 SSH 私钥内容。

## 安装

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | sh
```

安装脚本会解析最新的 [GitHub Release](https://github.com/Th1Humble/sshift/releases)，下载对应的固定版本二进制，校验 checksum 后默认安装到 `~/.local/bin`。

当前支持 macOS 和 Linux，暂不支持 Windows。

确保 `~/.local/bin` 已加入 `PATH`：

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

如果要安装到其他目录：

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | INSTALL_DIR=/usr/local/bin sh
```

指定版本安装：

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | SSHIFT_VERSION=v0.2.1 sh
```

也可以从 [GitHub Releases](https://github.com/Th1Humble/sshift/releases) 下载独立二进制：

```bash
tar -xzf sshift-v0.2.1-darwin-arm64.tar.gz
chmod +x sshift
sudo mv sshift /usr/local/bin/sshift
```

## 快速开始

```bash
# 已有 GitHub 配置也可以直接添加 GitLab 或其他平台
sshift add

# 查看已配置的身份
sshift list

# 修改姓名、邮箱、平台地址或 key
sshift add --edit gitlab-com-work

# 在仓库内检查实际 SSH key 和新提交的作者
sshift doctor

# 删除身份及其自动匹配规则，保留 SSH key 文件
sshift rm gitlab-com-work
```

添加时选择平台、填写平台账号和提交姓名／邮箱，再选择已有 key 或生成新 key。sshift 展示公钥及平台登记入口，确认后同时保存身份并激活 SSH 和 Git 配置。

你仍然需要把公钥登记到平台。之后正常使用 `git clone`、`git pull`、`git commit`、`git push`，不需要再执行应用或绑定命令。

## 四个命令

| 命令 | 用途 |
|------|------|
| `sshift add` | 添加身份，自动配置 SSH key 和 Git 作者 |
| `sshift add --edit <name>` | 在同一个向导中修改已有身份并立即生效 |
| `sshift list` | 查看身份、Git host、提交作者和配置状态 |
| `sshift rm <name>` | 移除身份及其路由，保留 key 文件 |
| `sshift doctor` | 检查当前仓库实际生效的 SSH key、作者和提交者 |
| `sshift doctor --fix` | 重新生成受管理配置，并协助修复当前仓库身份 |

`add --yes` 跳过最后的配置激活确认，向导中的其他问题仍会询问。`rm --yes` 跳过删除确认。

### 修改身份

`add --edit` 展示当前值，只选择需要修改的字段即可。可以修改提交姓名、邮箱、平台地址、SSH host／alias、平台账号、SSH 用户或 key。

邮箱修改后，匹配的仓库后续提交会使用新邮箱；已存在的提交作者不会被改写。已有的旧 profile 如果缺少姓名或邮箱，使用这个向导补齐，不需要手动编辑 TOML。

### 检查和修复

```bash
cd ~/project
sshift doctor
sshift doctor --fix
```

doctor 读取 Git 实际生成的作者与提交者身份，而不只是显示配置文件。它检查 SSH 实际选中的 key，并测试平台认证。

已有仓库的 local/worktree `user.name`、`user.email` 会覆盖自动身份。`add` 在当前仓库发现这种情况时会询问是否迁移；其他已有仓库可以运行 `doctor --fix`，确认后清除这些覆盖值。仓库其他设置保持原样。

环境变量 `GIT_AUTHOR_*`、`GIT_COMMITTER_*`、命令行 `git -c` 或其他 include 中的身份设置仍可能覆盖规则。doctor 会显示不一致和配置来源；它不会修改你的 shell 环境。

## 自动匹配如何工作

每个身份包含两部分：

- SSH key 决定拉取、推送时用哪个平台账号认证。
- 提交姓名和邮箱决定新 commit 的作者信息；平台账号名不一定等于提交姓名。

sshift 在 `~/.ssh/config` 中维护自己的配置块，在 Git 全局配置中加入自己的 include 入口，并生成基于 remote URL 的条件规则：

```text
仓库 remote 是 git@github.com:owner/repo.git
→ 使用 GitHub key，以及 GitHub 身份的提交姓名和邮箱

仓库 remote 是 git@git.company.com:team/repo.git
→ 使用公司 key，以及公司身份的提交姓名和邮箱
```

SSH、带端口的 SSH URL 和 HTTPS URL 都能匹配提交作者。HTTPS 的拉取／推送使用 HTTPS 凭据，不使用 SSH key。

这些规则对已有仓库和之后 clone 的仓库都生效。工具不需要一直运行，不安装 Git hooks，也不包装 Git 命令。Git 原有全局姓名／邮箱字段保持不变；未匹配的仓库继续使用原有配置。

### 同平台多个账号

当同一个平台已经有身份时，添加向导会创建独立 SSH alias。例如：

```bash
git clone git@github.com:personal/repo.git
git clone git@github.com-work:company/repo.git
```

两个 host 分别选择各自的 key 和提交作者。alias 由向导填写，示例名称可以不同。如果你在已有仓库里添加对应身份，向导可协助更新当前仓库的 origin；其他仓库可运行 `doctor --fix` 选择身份。

添加时遇到已有非受管理 Host，默认提供独立 alias，保留原来的路由。也可以明确选择让该 host 优先使用所选 key；原有配置文本仍然保留，可能存在其他候选 key，doctor 会提示。

## 配置与恢复

身份保存到 `~/.config/sshift/profiles.toml`，Git 条件规则保存到同目录的 `git.conf` 和 `identities/`。

每次添加、修改、删除或修复前，相关配置都会备份到 `~/.config/sshift/backups/`。SSH、Git 和身份存储按一次操作更新；写入失败时自动恢复本次改动。删除最后一个身份时，工具移除自己的 SSH 配置块和 Git include 入口。

仓库修复也会单独备份 repository config，失败时恢复。备份不包含私钥内容；成功操作的历史备份保留在本地。

## 要求和边界

- 支持 macOS 和 Linux，自动作者匹配需要 Git 2.36 或以上。
- Git 的 remote 条件检查所有 remote；如果一个仓库同时配置多个匹配不同身份的 remote，可能匹配多个作者规则。doctor 会检查实际作者；`doctor --fix` 可为选定身份补充仓库规则。修改 remote 后应重新检查。
- 同平台多账号通过 SSH alias 区分；HTTPS 地址不能使用 SSH alias 来区分账号。
- 不管理 SSH agent，也不修改已有 commit 的作者。
- 新 key 默认使用 ed25519，已有 key 文件不会被覆盖，私钥内容由原生 OpenSSH 处理。

## 卸载

先运行 `sshift list`，再用 `sshift rm <name>` 移除各个受管理身份。移除最后一个身份后，自动配置入口也会清理，SSH key 文件仍保留。

然后删除安装位置的 `sshift` 二进制。可按需删除 `~/.config/sshift` 中的配置和备份。

## 许可证

MIT
