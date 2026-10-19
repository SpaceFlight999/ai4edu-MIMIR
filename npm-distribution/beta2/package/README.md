# MIMIR 安装器 · beta2

MIMIR 将成长规划、课程学习、竞赛实践、论文阅读与阶段回望集中在个人学习工作空间中。

支持 Windows 10/11 x64。请先安装 Node.js 24 或更新版本，无需单独配置 DSH，也无需 npm 或 GitHub 账号。

打开 Windows PowerShell，执行：

```powershell
npx.cmd --registry=https://registry.npmjs.org/ @spaceflight99/mimir@0.12.11-beta.2
```

首次执行会下载约 938 MiB 的运行包，验证 SHA-256，解压并创建桌面「MIMIR」快捷方式，然后启动。解压后约占 2.23 GiB；安装过程还需保留压缩包缓存，请至少预留 5 GiB。以后可直接双击桌面图标启动。

仅安装并创建快捷方式、暂不启动：

```powershell
npx.cmd --registry=https://registry.npmjs.org/ @spaceflight99/mimir@0.12.11-beta.2 --install-only
```

beta2 改进了 Windows 长路径解压，更新使用说明，桌面快捷方式使用程序现有的双线 M 托盘图标。npm 发布号为 `0.12.11-beta.2`，现有成长功能版本保持 `0.12.10`。

程序安装在 `%LOCALAPPDATA%\MIMIR-Evaluation\versions\b2-1171b80c6d40\runtime`。用户资料继续保存在 `%LOCALAPPDATA%\MIMIR-Evaluation\data\0.12.10`，升级前请从托盘退出旧程序。关闭网页不会停止后台服务。

AI 功能需要配置使用者自己的模型与 API Key，费用由对应模型账户承担。

如果桌面创建失败，安装器会显示提示；排除桌面写入权限或同名快捷方式冲突后，可重新执行安装命令。手动解压 GitHub ZIP 后运行 Mimir.exe 时，默认数据目录为 `%LOCALAPPDATA%\Mimir Beta`；需要保持原有 npx 数据时请使用上述安装命令和它创建的快捷方式。

[项目首页与详细使用说明](https://github.com/SpaceFlight999/ai4edu-MIMIR) · [beta2 发布页](https://github.com/SpaceFlight999/ai4edu-MIMIR/releases/tag/v0.12.11-beta.2)
