# 当前仓库更新（2026-10-17）

现有仓库：https://github.com/SpaceFlight999/ai4edu-MIMIR，默认分支 main。当前版本 0.12.10，更新说明见根目录 README.md 和 HANDOFF.md。已有仓库直接提交并正常推送，保留远程历史和附件，不重复创建仓库或强制推送。

源码上传包括 mimir-wordmark/ 的透明素材、线描与局部动画源代码、生成资源，以及 growth/、scripts/、docs/；排除 runtime、data、.test-data、artifacts、node_modules 和凭据。克隆源码后需另备原始 Windows 基线包恢复运行环境。

以下是早期首次上传操作说明，仅供追溯。

# 上传到 GitHub

仓库名称：`ai4edu-MIMIR`，初次上传使用私有仓库。

## 上传范围

上传 `growth/`、`scripts/`、`docs/`、README、package.json、上游交接说明、启动与安装入口，以及根目录比赛说明文档。`.gitignore` 排除了运行环境、原始运行包 ZIP、旧解压目录、个人数据、验收缓存、依赖、日志和本地凭据。

GitHub 上的源码需要配合原始 `Mimir-0.12.0-beta.1-Windows-x64.zip` 恢复运行。该文件另外保留；新电脑把它放到源码根目录，按照 README 执行安装与启动。不要把本机 `data/` 或凭据一起上传。

## 首次上传

1. 登录 GitHub，打开 <https://github.com/new>，仓库名填写 `ai4edu-MIMIR`，选择 **Private**。不要勾选自动创建 README、.gitignore 或 License，然后点击 **Create repository**。
2. 在下面的项目目录打开 PowerShell。将命令中的 `你的用户名` 换成 GitHub 用户名。

```powershell
Set-Location -LiteralPath 'D:\Xiaorui Wang\AI+竞赛资料\ai4edu-MIMIR (2)\ai4edu-MIMIR'
git init -b main
git add .
git diff --cached --stat
git status --short
```

检查待提交清单：不应出现 `runtime/`、`data/`、`.test-data/`、`artifacts/`、原始运行包 ZIP、旧解压目录或真实 API Key。

如未设置 Git 提交身份，先运行下面两行；邮箱建议使用 GitHub 设置中的提交隐私邮箱。

```powershell
git config user.name '你的显示名'
git config user.email '你的 GitHub 提交邮箱'
```

完成检查后提交并上传；推送时如果提示登录，按 Git 的浏览器登录提示完成认证。不要把访问令牌写进仓库地址。

```powershell
git commit -m 'Initial import of MIMIR growth workspace'
git remote add origin https://github.com/你的用户名/ai4edu-MIMIR.git
git push -u origin main
```

本节的初始化、首次提交与添加 origin 只执行一次。如果目录已存在 Git 仓库，先检查 `git status` 和 `git remote -v`，不要重复初始化或添加 origin。

## 后续更新

```powershell
git add .
git diff --cached --stat
git commit -m '描述本次修改'
git push
```

上传后刷新 GitHub 仓库页面，确认显示 Private、最新提交和源码目录。本项目依赖 Windows 本地 Mimir 运行环境，上传源码本身不会将应用部署成在线网站。

GitHub 官方说明：<https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github>
