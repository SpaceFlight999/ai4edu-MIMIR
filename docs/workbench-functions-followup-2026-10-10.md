# 工作台实际功能补验

2026-10-10，按用户要求先完成功能与质量验收，不再压缩。测试使用已安装的原生后端、随包 Python/MiKTeX、新建合成 home 和文件；没有调用付费模型，也未读取个人资料。最新结果为 `artifacts/workbench-functions-final-20261010.json`：19/19 组通过，原文稿未改变，测试宿主正常退出。

实际完成 Word 新建/结构读取/下载、普通替换与源文件不变、保留未接受修订的最终视图；Markdown 导入/读取/下载；PDF 指定页提取、拆分/合并/顺序核对及水印；CSV 曲线输出 PNG/PDF/SVG、可编辑 SVG 自动布局、图形历史与批注；Python 导入 CSV 后实际计算并生成结果文件；PowerShell 与 Bash 实际输出；LaTeX 模板复制及真实 PDF 编译；BibTeX 输出；不存在文件与非法页码拒绝。

联网部分实际调用官方 arXiv/Crossref 检索、Crossref DOI 元数据、arXiv 原始页面读取与字段核对，没有用本地 feed 替代。字段核对保留 `partial`：标题匹配、年份存在、页面未提供 DOI，不能将其改写为全部核对成功，更不能把 DOI 元数据当成语义或同行评审证明。

## 标题核对断言补验

独立审查发现，原脚本读取 `research.verify` 返回值后没有断言标题状态，返回 `mismatch` 也会将该场景记为通过。原 19/19 报告中实际返回的 `fields.title.status` 为 `matched`，因此本次标题实际匹配的证据有效，但原脚本未充分约束后续回归。

现已补入标题状态必须为 `matched` 的断言，沿用现有 `--only` 单项模式；整体 `partial` 仍可接受，不要求原页不存在的 DOI。只读隔离模拟确认标题 `mismatch` 会失败、标题匹配且 DOI 缺失的 `partial` 会通过。

随后实际运行 `scripts/verify-workbench-functions.mjs --network --only research-read-and-verify-original-page --report artifacts/workbench-research-title-followup-20261010.json`，直接读取 [arXiv 原页](https://arxiv.org/abs/1706.03762) 并核对 `Attention Is All You Need`：1/1 通过，标题 `matched`、整体 `partial`、年份 2017、DOI 缺失。新报告单独保存，原 19 项报告保留；合成 home 内主稿未改变，宿主正常退出，付费模型调用为 0。此次仅修改验证脚本与说明，没有修改或安装生产代码。

另记录内部非阻塞边界：`runLocal` 的 Windows Bash 查找使用 `process.env.PATH`，子进程环境则合并调用者 `env`。若内部调用者额外覆盖 PATH，查找路径与子进程 PATH 可不同；当前工作台 Bash 入口仅补充 `MIMIR_WORKSPACE`，不开放自定义 PATH，因此现有入口不触发此差异。本轮生产代码不作修改。

## 修复及失败保留

首次工具补验的下载地址在新验收脚本中写错，返回 404；纠正为已注册 `/api/mimir/file` 后 18/18 组通过。该错误属于验收脚本，首轮报告 `workbench-functions-first-followup-20261010.json` 保留。

额外 Bash 实测发现产品缺陷：Windows 已有 `C:/Program Files/Git/bin/bash.exe`，但 Git 只有 `cmd` 在 PATH，原调用 `spawn('bash', ...)` 无法启动。现有后端识别 PATH 中的真实 Bash 文件、Git cmd 相邻 bin、标准及用户 Git 安装；使用原有参数与直接进程调用，不下载安装程序。缺失环境时返回明确中文提示。跨平台其他运行分支、超时、取消和输出限制保留。

[Git for Windows 官方说明](https://gitforwindows.org/) 确认其包含 Bash 环境；具体查找顺序是本项目 Windows 修复决定。四项正反单元测试覆盖 PATH 优先、自定义 Git、标准/用户安装与目录/缺失拒绝。安装后真实 Bash 输出 `2`，纳入最终 19 组。之前原生失败报告 `workbench-bash-first-20261010.json` 保留。

## 复测及范围

运行 `scripts/verify-workbench-functions.mjs --network --report artifacts/<新的文件名>.json`。报告保存每项真实结果与失败，独立报告拒绝覆盖历史；`--only runtime-bash` 可仅检查 Bash。生成文件均留在合成 home 中。

本机完整运行库通过不等于另一台干净 Windows 已验收。Bash 使用本机已安装的 Git for Windows，未将 Git 包装成随包依赖；另一台设备没有 Bash 时需要自行提供该环境，Python/PowerShell 仍为其他现有选项。纸笔或脚本计算不代表硬件测试，也不证明模型产出准确。AI 内容质量由主线独立复核报告说明。
