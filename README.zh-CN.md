# sshift

[English](./README.md)

为每个 Git 仓库使用正确的 SSH key。

sshift 帮助开发者管理多个 SSH key，覆盖 GitHub、GitLab 及自定义 Git 主机。它在 `~/.ssh/config` 中写入一个受管理的配置块，让原生的 `git clone`、`git pull`、`git push` 直接生效——无需包装器、无需代理、无运行时开销。

sshift 绝不上传、存储或读取你的 SSH 私钥内容。

## 为什么需要 sshift

很多开发者同时使用多个 Git 平台：

- 公司的 Git 平台，使用公司 SSH key
- 个人的 GitHub 账号，使用个人 SSH key
- 内部 Git 服务器，又是另一个 key

OpenSSH 本身支持通过 `~/.ssh/config` 将不同主机路由到不同 key。但配置格式繁琐、容易出错，出了 `Permission denied (publickey)` 也很难排查。

sshift 让正确的做法变简单：

1. 添加一个 profile（平台 + 账号 + key）
2. sshift 帮你写好 SSH config
3. 你继续正常使用 `git clone git@github.com:...`

## 安装

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | sh
```

安装脚本会解析最新的 [GitHub Release](https://github.com/Th1Humble/sshift/releases)，下载对应的固定版本二进制，校验 checksum 后安装。

指定版本安装：

```bash
curl -fsSL https://th1humble.github.io/sshift/install.sh | SSHIFT_VERSION=v0.1.2 sh
```

也可以从 [GitHub Releases](https://github.com/Th1Humble/sshift/releases) 下载独立二进制：

```bash
tar -xzf sshift-v0.1.2-darwin-arm64.tar.gz
chmod +x sshift
sudo mv sshift /usr/local/bin/sshift
```

## 快速开始

```bash
# 新电脑：添加第一个身份
sshift add

# 查看当前环境
sshift scan

# 诊断某个仓库
cd ~/my-project
sshift doctor
```

## 命令一览

| 命令 | 说明 |
|------|------|
| `sshift add` | 交互式添加一个或多个 SSH 身份 |
| `sshift scan` | 扫描本地 SSH key、config 和 Git 身份 |
| `sshift apply` | 从 profile 重新生成受管理的 SSH config 块 |
| `sshift doctor` | 诊断当前 Git 仓库的 SSH 身份 |
| `sshift bind <profile>` | 将 profile 的 Git 作者信息写入当前仓库 |
| `sshift rollback` | 从备份恢复 SSH config |
| `sshift profile list` | 列出所有已配置的 profile |
| `sshift profile rm <name>` | 删除一个 profile |

### `sshift add`

交互式添加 SSH 身份：

1. 选择主机模板（GitHub、GitLab 或自定义）
2. 输入账号名
3. 生成新 SSH key 或选择已有 key
4. 预览受管理的 SSH config 块
5. 可选择立即应用

一次会话中可以添加多个 profile——每添加一个后会询问"是否继续添加？"

```bash
sshift add          # 交互式
sshift add --yes    # 跳过最终确认直接应用
```

### `sshift scan`

展示当前 SSH 和 Git 环境状态：

- 可用的 SSH key 及指纹
- 已有的 `~/.ssh/config` Host 条目（受管理的和非受管理的）
- 全局 Git 身份（`user.name` / `user.email`）
- 已配置的 sshift profile

```bash
sshift scan
```

### `sshift apply`

从所有已保存的 profile 重新生成受管理的 SSH config 块，写入 `~/.ssh/config`。每次写入前自动创建备份。

```bash
sshift apply            # 写入前确认
sshift apply --preview  # 只打印不写入
sshift apply --yes      # 跳过确认直接写入
```

如果你的 SSH config 中有非受管理的 `Host` 条目与 profile 冲突，sshift 会发出警告但不会覆盖它。

### `sshift doctor`

诊断当前 Git 仓库：

- 读取 `origin` remote URL
- 匹配对应的 profile
- 检查 OpenSSH 实际会使用哪个 key（`ssh -G`）
- 测试 SSH 认证（`ssh -T`）
- 对比本地 Git 身份与 profile

```bash
cd ~/my-project
sshift doctor
```

输出示例：

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

将 profile 的 `git_name` 和 `git_email` 写入当前仓库的 local config。适用于需要按仓库区分提交身份的场景。

profile 必须配置了 `git_name` 和 `git_email`。你可以直接编辑 `~/.config/sshift/profiles.toml` 添加这些字段。

```bash
sshift bind github-com-th1humble
sshift bind github-com-th1humble --yes   # 跳过确认
```

### `sshift rollback`

从最近的备份恢复 `~/.ssh/config`。

```bash
sshift rollback                    # 恢复最近的备份
sshift rollback --backup <path>    # 恢复指定备份文件
sshift rollback --yes              # 跳过确认
```

### `sshift profile list`

以表格形式列出所有已配置的 profile。

```bash
sshift profile list
```

### `sshift profile rm <name>`

删除一个 profile 并重新生成 SSH config 块。**不会**删除 SSH key 文件。

```bash
sshift profile rm github-com-th1humble
sshift profile rm github-com-th1humble --yes   # 跳过确认
```

## 使用场景

### 新电脑

从零开始，没有任何 SSH key：

```bash
sshift add
# → 选择 GitHub，输入账号，生成 key
# → 复制打印出的公钥到 GitHub Settings → SSH Keys
# → "是否继续添加？" → 是
# → 选择 GitLab，输入账号，生成 key
# → 复制公钥到 GitLab
# → "是否继续添加？" → 否
# → 应用受管理的 SSH config 块

# 验证
sshift doctor
```

### 已有工作电脑

你已经有公司的 SSH key 和 Git 配置，想增加个人 GitHub 身份而不破坏现有配置：

```bash
# 查看当前配置
sshift scan

# 添加 GitHub 身份
sshift add
# → sshift 先展示已有 profile
# → 添加 GitHub profile 和新 key
# → sshift 只写入自己的受管理块，不动你已有的配置

# 验证两边都正常
cd ~/work-project && sshift doctor
cd ~/personal-project && sshift doctor
```

### 日常使用

配置完成后，sshift 是透明的。你正常使用 Git：

```bash
git clone git@github.com:user/repo.git    # 使用 GitHub key
git clone git@gitlab.com:team/project.git  # 使用 GitLab key
git push                                    # 根据 host 自动选择正确的 key
```

OpenSSH 读取 `~/.ssh/config` 并将每个 host 路由到正确的 key。sshift 已经写好了配置——它不需要运行。

### 出了问题

```bash
# 诊断
sshift doctor
# → 显示 SSH 会使用哪个 key，认证是否成功

# 如果是 sshift 配置的问题，回滚
sshift rollback
```

## 工作原理

### 受管理的 SSH Config 块

sshift 在 `~/.ssh/config` 顶部写入一个明确标记的块：

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

受管理块之外的所有内容原样保留。sshift 绝不触碰非受管理的内容。

### Profile 存储

Profile 存储在 `~/.config/sshift/profiles.toml`：

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

### 备份

每次 sshift 写入 `~/.ssh/config` 前，会先将当前文件复制到：

```
~/.config/sshift/backups/ssh_config.<时间戳>
```

使用 `sshift rollback` 恢复任意备份。

## 安全保证

- 绝不上传 SSH key
- 绝不读取私钥文件内容
- 绝不存储私钥内容——只记录文件路径
- 指纹仅从公钥派生
- 只编辑 SSH config 中自己的受管理块
- 绝不改写非受管理的 SSH config 条目
- 每次写入前创建备份
- 所有受管理的修改都可通过 `sshift rollback` 回滚
- 使用原生 OpenSSH（`ssh-keygen`、`ssh -T`、`ssh -G`）
- 使用原生 Git（`git config`、`git remote`）

## 限制（v1）

- **每个 host 只能一个 profile。** 同一个 `github.com` 上的两个账号需要 host alias，计划在 v2 实现。
- **不管理 SSH agent。** sshift 配置 `IdentityFile` 和 `IdentitiesOnly`——不启动或管理 `ssh-agent`。
- **不自动切换 Git 身份。** 手动使用 `sshift bind`，或自行在 `~/.gitconfig` 中配置 `includeIf`。

## 卸载

```bash
sudo rm -f /usr/local/bin/sshift

# 可选：删除 sshift 配置和备份
rm -rf ~/.config/sshift

# 手动从 ~/.ssh/config 中删除受管理块，
# 或在卸载前恢复备份：
# sshift rollback
```

## 许可证

MIT
