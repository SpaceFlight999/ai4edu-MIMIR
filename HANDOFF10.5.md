# Mimir 项目完整交接

更新日期：2026-10-05，Asia/Shanghai。交付基线：0.12.0-beta.1 / Windows x64。源码基线：master，a736ff8（feat: deliver integrated Mimir Windows beta with user-flow acceptance）。

本文件供进入新电脑、目录或对话环境的 agent 接手。事实依据为当前源码、现有整包和验收记录；建议、已完成和未验证项分别列出。用户最新指令优先于历史方案。

本次只整理交接，没有修改功能、重新打包或更新正在运行的实例。原交接归档至 [旧交接](docs/history/HANDOFF_2026-10-04_legacy.md)，其中独立插件交付、旧绿色主题及依赖首次自动安装等说明仅用于追溯。

## 1. 当前产品及接手入口

Mimir 是面向科研的本机 Agent 产品，主要空间：

- **研究探讨**：研究对话、项目/研究管理、共享模型选择及论文/文稿入口。
- **论文导读**：PDF 解析与阅读、搜索和证据定位、高亮/批注、导读与多论文研究。
- **文稿工作台**：富文本编辑、批注及 AI 建议、LaTeX 源码/编译/PDF 预览、Word/Markdown/PDF 文件处理、数据运行与科研绘图。

最初由科研工作台插件与合作伙伴的论文导读插件整合，内部仍基于 DeepSeek Harness RC2。目前交付为一个 Mimir 软件，合作伙伴不再分别安装宿主和插件。

当前形态是 Windows 原生启动器/托盘、本机服务和浏览器界面。双击 Mimir.exe 后打开默认浏览器。它不是 Electron 桌面壳，也不是原生文稿编辑器。

Windows x64 免安装包已完成本机离线工具、真实接口、持久化与多项界面验收。它仍是测试版；高亮撤回、其他操作可恢复性、另一台电脑以及原生托盘/凭据窗口验收有明确缺口。

### 接手前十分钟

1. 确认主仓库和 Git 状态，保留已有改动；D:\Mimir 是父目录，源码在 D:\Mimir\mimir。
2. 读本文件、[整包验收](docs/WINDOWS_BETA_ACCEPTANCE_0.12.0-beta.1.md)、[延期问题](docs/BETA_BACKLOG.md)。
3. 核对 ZIP 的版本与 SHA-256；若仅迁移源码，明确未迁移哪些交付证据。
4. 区分真实用户数据、历史预览与一次性测试数据，避免混用。
5. 改前端前读 0.11.4/0.11.3 验收；改功能先复现完整用户闭环。
6. 不因历史文档或旧对话存在而重新恢复旧插件安装、绿色主题或 DSH 设置。

## 2. 用户已经明确的产品决定

下列要求来自用户多轮迭代；它们比早期施工方案更接近当前方向。后续用户新要求仍优先。

### 产品与范围

- 对外只呈现 Mimir；去掉 DSH 品牌、旧设置、插件管理、运行模式等入口。
- 默认且只展示科研工作层。历史模式代码可暂存，但不得留下用户入口。
- 不采用“一切皆插件”的理念。设置仅外观配色与模型选择，不提供任意插件、预设、权限策略、字体/布局等自定义。
- 移除高级配置入口不代表绕过执行授权和数据保护。
- 用户明确要求删掉研究对话“轨迹”。ui-trajectory 已在装配与产品策略禁用，不应恢复。
- 本任务线负责前端、整合与交付。harness 底层优化此前另开讨论，不自行扩大为底层重写。
- 用户最近评价 UI“差不多了”；当前重心是功能可靠性、整包和彻底自检。
- 高亮直接取消/一步撤回按用户要求延期至下一版，本版先交付整包。

### 视觉与交互

- 不用绿色；当前四组色调均不含绿色。
- 深浅色模式全局共用；研究、论文、文稿分别选色调。
- 专业、现代、高级生产力/科研工具气质；避免营销页面、模板式 SaaS Dashboard。
- 层次依靠留白、排版、半透明、轻微模糊、多层柔和阴影、弱渐变光场、细边界与环境纹理。
- 避免大面积纯色、过多卡片、全部内容容器化、过度圆角、强霓虹和廉价科技感。
- “克制”不能做成平、素、看不见互动；用户要求可感知的光场、纹理、深度与粒子。
- 粒子缓慢沿设计过的曲线运动；用户否定杂乱、快速、单一直线轨迹。
- 页面切换连续丝滑，禁止整体晃动、多重位移/缩放/模糊叠加。
- 项目目录、论文侧栏、文稿导航与审阅可折叠；复杂工具区局部收起，保留状态。
- 长内容能滚动、滚动条可见；字体有层级，不能单薄单调。
- 用户后来允许论文/文稿局部结构调整，但不是授权新增功能或重构业务流程。

### 工作方式

用户要求新对话依次使用 using-superpowers、caveman full；写代码后寻找 simplify，复核复用、简洁与效率。详细交接不能因输出压缩而丢失事实。

**本项目停用 frontend-design**，这是用户明确指令。曾多次指定 Figma；需要设计时可使用，但新环境必须确认连接与额度。

此前未找到 simplify Skill，记录为人工复核，不能宣称已执行不存在的 Skill。Skills、账户、浏览器和连接器状态不可假定随源码迁移。

用户倾向直接推进已授权工作，少做无必要确认。验证报告要区分自动回归、接口、界面、原生桌面及另一台电脑，不能以局部通过声称全面通过。

## 3. 环境、版本及目录

| 项目 | 当前基线 |
| --- | --- |
| 环境 | Windows / PowerShell / Asia/Shanghai |
| 父工作目录 | D:\Mimir |
| 主源码仓库 | D:\Mimir\mimir |
| Git | master / a736ff8，本次交接前工作区干净 |
| 当前软件/内部 bundle | 0.12.0-beta.1 |
| 内部引擎 | @deepseek-ai/dsh 0.1.7-rc.2 |
| RC2 历史固定源码提交 | 477b4f420553e8a52c2fbccc464d7561b239c443 |
| 包内 Node | 24.16.0 Windows x64 |
| 包内 Python | CPython 3.12.10 Windows x64 |
| 包内 TeX | MiKTeX 25.12 便携完整树 |
| 包管理器 | pnpm 11.21.0，根 package.json 指定 |
| 前端 | React 18.3.1、Tiptap 3.31.3、MathLive 0.109.2、Vite、TypeScript |
| PDF | 自带 PDF.js worker/字体/CMap/WASM；Python PDF 解析依赖 |

新环境重新检查实际 cwd/文件/版本；本机绝对路径仅为迁移定位，不是硬编码要求。

### 父目录中的其他内容

- release：分发包、各阶段 tgz、验收副本、日志、合成资料和截图。
- dsh-smoke：历史真实 RC2 开发/预览，包括已有用户数据。
- review-paper-0.3.3、paper-guide-rc2：论文原包审查与适配历史。
- research-runtime：早期外部资料；当前参与构建的是主仓库 packages/research-runtime。
- unified-smoke：整合阶段测试。
- harness-coordination：分开的底层协作资料。
- _inventory、参赛方案：其他历史输入。

同名外部目录不自动代表最新代码。以主仓库 Git、package.json 和构建输入为准。

### 实例状态

旧用户预览曾在 http://127.0.0.1:55554/，数据为 D:\Mimir\dsh-smoke\ui-final-showcase，最后已知版本 0.11.4。不能保证它接手时仍在线。

2026-10-05 本次检查发现主分发目录中的 Mimir.exe 进程在运行；旧 55554 检查未见监听。PID、端口易变，不提供固定 PID 作为操作依据。

不要为了测试停止所有 Node/Mimir、覆盖旧 profile 或清空默认数据。先核对启动路径、数据目录和归属，仅操作明确的测试实例。

## 4. 当前交付物与使用

合作伙伴整包：

    D:\Mimir\release\Mimir-0.12.0-beta.1-Windows-x64.zip

SHA-256，2026-10-05 重新核对一致：

    8bf66147af64c0490a135f8509237b6a19a582c7b28bf9101e653e9c8ba1d8de

- 983,187,761 字节，约 983 MB / 938 MiB；展开约 2.37 GB。
- 64,079 文件，实际安装 521 个 npm 包、59 个 Python 包。
- Node、Python、科研/PDF/MCP 依赖、便携 MiKTeX 已内置。
- 保留 MiKTeX 对应官方源码与第三方许可，TeX 宏包 doc/source/许可证未删。
- 旁边有 .zip.sha256；没有开发者 API Key、论文、研究或开发 profile。
- 内部 mimir-dsh-workbench-bundle-0.12.0-beta.1.tgz 是工程输入，不要求收件人另行安装。

主分发树：

    D:\Mimir\release\Mimir-0.12.0-beta.1-Windows-x64

独立完整解压验收副本：

    D:\Mimir\release\解压 验收\Mimir-0.12.0-beta.1-Windows-x64

包内布局：

~~~text
Mimir.exe
使用说明.txt
system/
  app/                       本机产品启动脚本
  engine/                    RC2、内置 Mimir bundle、npm 依赖
  node/                      Node 及 LICENSE
  python/                    CPython、标准库、科研依赖
  tex/                       完整便携 MiKTeX
  licenses/
    THIRD_PARTY_NOTICES.md
    source/miktex-25.12-source.tar.gz
  inventory.json             文件大小、SHA-256 与组件信息
  product.json               产品及运行时版本
  policy.yml                 装配约束
~~~

Windows 10/11 x64，完整解压到可写位置，双击 Mimir.exe。首次可输入自己的 DeepSeek Key，也可跳过使用本地功能。在线模型/文献访问依赖收件人账户和网络。

默认数据在 %LOCALAPPDATA%\Mimir Beta；新研究工作路径为 workspace\默认项目。关闭浏览器不会停止后台，需托盘退出。启动器未签名；没有已完成的安装器/自动升级系统。另一台真实 Windows 尚未验收。

## 5. 推进历程及成果

| 阶段 | 当前意义 |
| --- | --- |
| 工作台 0.8.x | 编辑/工具/AI 协作、真实 RC2 装载和审查；绿色样式已替换 |
| 论文 0.3.3 审查与 RC2 适配 | 合作伙伴原插件纳入主仓库 |
| 统一 0.9.1 | 论文、文稿和 research-runtime 共享 Core、模型、身份与证据消费 |
| 0.10 / 0.11.0 | Mimir 专用产品壳、收敛设置/模式 |
| 0.11.1 | Figma 参考、环境光场、引导粒子和空间过渡 |
| 0.11.2 | 专用粒子/更多折叠，部分视觉后来被用户否定 |
| 0.11.3 | 侧栏折叠、撤密集信号带、慢速疏朗曲线粒子 |
| 0.11.4 | 高亮绘制/缩放/下载/滚动修复，全局明暗、字体、防晃动 |
| 0.12.0-beta.1 | Windows 整包、离线依赖、首次初始化、轨迹禁用、用户验收 |

当前为“整包产出并完成本机测试，准备合作伙伴试用”。不是只做 UI 原型，也不是已正式发布、补齐全部撤回或完成跨机器验收。

某些历史文档仍保留旧版本和限制，以当前源码、package/product metadata 和最新验收为准。

## 6. 架构及数据流

### 启动链

1. Mimir.exe 处理首次说明、Key、安全存储、单实例和托盘。
2. 启动包内 node.exe / system/app/app.mjs；凭据经标准输入，不放命令行。
3. 配置产品数据目录、内置 Python/TeX、缓存及 profile。
4. 加载包内 dsh-base、dsh-web-app、Mimir bundle。
5. 绑定 127.0.0.1，建立受认证 UI/API，先初始化默认工作区，再报告就绪。
6. 普通模式打开默认浏览器，呈现 Mimir 三空间。
7. 用户操作经 Host 调 Core、论文、研究运行层和本地工具。

RC2 bundle 是内部机制，不是用户插件管理理念。

### 职责边界

- 浏览器：展示、编辑、候选建议，不能成为权威存储或绕过授权。
- Host：已认证文档/文件/AI/工具接口及真实执行。
- Core：文档版本、提议、授权、引用、审计/outbox及事务。
- 论文服务：原 PDF、解析、阅读/批注持久化、能力阅读链接。
- research-runtime：任务、工作流、取消、锁与结果。
- 工具：在当前 Windows 用户权限下运行，**不是 OS 沙箱**。
- 当前为本机单 operator，**没有完整多用户身份/ACL**。

研究对话项目/会话和 Core 文稿不是已完全打通的多项目领域模型。当前 Host 有稳定 actorId/projectId 和默认文稿；论文桥仍用 DEMO_DOCUMENT_ID 作为笔记目标。不能宣称每个研究项目都有完全隔离的文稿/论文授权域。以后完成多项目需要数据契约与迁移。

    默认文稿 ID：11111111-1111-4111-8111-111111111111
    初始段落 ID：33333333-3333-4333-8333-333333333333

不要随意更换种子 ID 或身份文件导致旧数据脱离入口。

## 7. 源码地图

pnpm workspace：packages/*、apps/*。

| 目录 | 职责 |
| --- | --- |
| packages/contracts | JSON Schema / Ajv 契约 |
| packages/core-document | SQLite、CAS、幂等、提议/授权、引用、审计/outbox |
| packages/plugin-workbench | React/Tiptap 工作台及工具 UI |
| packages/dsh-workbench-bundle | RC2 装配、产品壳、Host、论文/研究桥、最终 client |
| packages/paper-guide | 权威论文源码、viewer、解析 runtime与服务 |
| packages/research-runtime | 冻结 0.1.0 研究运行层 |
| packages/research-sources | 学术来源查询、DOI/来源核对 |
| packages/file-tools | Python Word/PDF 等工具、离线 wheels |
| packages/research-figures | Python 数据图与 SVG |
| packages/latex-local | 编译与模板 |
| packages/local-execution | 本地代码执行 |
| apps/workbench-preview | Vite 组件预览，模拟 Port |
| distribution | Windows 启动器、产品启动/锁定依赖/整包脚本 |
| scripts / docs | 测试聚合、工程辅助 / 设计与验收 |

### 产品壳：bundle/src

- client-entry.js：真实 Client 入口。
- product-shell.js/css：导航、目录、首页、布局、视觉。
- product-theme.js：全局 mode、空间 palette、论文主题桥。
- product-settings.js：仅外观/模型设置。
- product-motion.js：过渡、导航指示、环境曲线粒子和视差。
- product-copy.js、product-brand.js：产品文案与 Host 品牌。
- 内嵌论文桥按实际 src 文件定位；不要从生成 client 的压缩代码开始改。

壳适配 RC2 slot/React 生命周期，保留原事件、子组件与状态，处理迟到注册和卸载恢复。不能全局替换用户内容中的 dsh，也不能只用 CSS 遮住残留入口。

兼容样式有部分 RC2 生成类名依赖；升级引擎必须重验输入、设置、导航、滚动，而非只看编译。

### 工作台：plugin-workbench/src

- Workbench.tsx：编辑、保存、批注/提议、导航/审阅折叠。
- model.ts：WorkbenchPort、SuggestionProvider、文档/ChangeSet。
- editor/extensions.ts、annotations.ts：Tiptap/ProseMirror、稳定块和选区。
- host/HttpWorkbenchPort.ts、HttpSuggestionProvider.ts、HostToolsClient.ts：真实 Host 连接。
- tools/ToolsPanel.tsx：文件/项目、LaTeX、Word、数据、绘图、AI 协作。
- LatexCodeEditor.tsx、PdfPreview.tsx、ModuleAiPanel.tsx：局部组件。
- export/：MD/TeX导出，公式白名单与转义。
- style.css、style-studio.css、style-prism.css、theme.css：组件/空间样式。

### 论文：paper-guide

- src/host.mjs：Host 入口。
- viewer/reader.mjs/html/css、refraction.css：阅读器与布局。
- viewer/highlights.mjs：文字层高亮绘制；下一版撤回需一起检查批注操作链。
- viewer/drafts.mjs：草稿与放弃修改。
- viewer/research-ui.mjs：研究结果及操作。
- viewer/motion.mjs：阅读空间动效桥。
- viewer/vendor：PDF.js/worker/字体/CMap/WASM。
- runtime：Python解析资源；细分存储/API按实际源码定位。

### Host / 研究：bundle/src

host-entry.js 提供工作台 Host；unified-entry.js 整合论文、Core 与研究层。

相关模块：research-core.js、research-adapter.js、research-preset.js、paper-migration.js、ai-models.js、editing-prompts.js、module-prompts.js、model-failure.js、tool-service.js、python-runtime.js、workspace-files.js、latex-annotations.js。

research-runtime 原冻结归档哈希：

    c76f982a6a26bfe3f5b6fd3771c6dd7b03d02159309a0a7d00410d4d83e5cdbe

此值不是当前整包哈希。


## 8. 数据位置、保存与授权

真实产品将 DSH_HOME 设为 Mimir 数据目录；默认 %LOCALAPPDATA%\Mimir Beta，测试可用 --data-home。

~~~text
<data-home>/
  model.secret                       当前 Windows 用户 DPAPI 加密凭据
  welcome.json                       首次说明
  server.json                        优先复用的 UI 端口
  instance.json                      活动实例及认证/退出凭据
  profiles/web/package.json          产品固定装配
  profiles/web/cordis.patch.yml       保存的模型选择
  workspace/默认项目                 新研究默认工作区
  sessions/、storages/                引擎会话与工作区数据
  cache/、tex/                       缓存、便携 TeX 用户配置
  mimir-workbench/
    identity.json                    稳定 actorId/projectId
    documents.sqlite                 Core 文稿与事务
    documents.sqlite-wal、-shm       活动 SQLite，存在时不可忽略
    files/                           导入/输出文件及元数据
    latex-annotations/               LaTeX 行批注
    paper-guide/                     原 PDF、解析、阅读、批注
    research-runs/                   研究任务与结果
    migrations/                      迁移记录/备份
~~~

instance.json 含进入 UI 与控制退出的凭据，不能将内容贴进交接/日志/截图/仓库。完整启动日志分享前也应检查认证 URL；API Key 同样不泄漏。

### 文稿保存

- 浏览器经 WorkbenchPort/Host/Core 写入，不能直接改 SQLite。
- expectedVersion/CAS 阻止过期覆盖；冲突明确呈现，不盲目自动合并。
- 幂等键保证重复请求不会重复应用；响应不明时重试原键，而非换键二次写入。
- AI 候选、提议、用户授权、实际应用是不同阶段；模型不能自授用户权限。
- ChangeSet、来源证明、引用和正文更新遵循现有事务边界。
- 拒绝建议不改正文；输入版本变化后旧建议失效。
- 切换/卸载顺序保存最新快照，防止正在保存时最后编辑丢失；直接关浏览器不保证异步保存完成。
- 不删除身份、outbox、审计来“清理错误”。
- 富文本 AI 替换当前支持完整纯文字段落，不能承诺任意富文本/行内公式选区。
- 手动编辑支持格式与公式，和 AI 替换范围限制不同。

### 论文证据与研究

每篇论文需用户显式启用工具消费。未授权不能发给模型；受限摘录/页面证据不等于整篇自动授权。PDF 解析不保证结论、表格/图片/公式语义正确，没有内置 OCR。

多论文综合需要至少两篇满足条件的论文；研究结果是草稿，引用/源版本核对后经提议确认写入。

任务支持持久化、取消和锁；宿主中断后标记 interrupted，不自动续跑。当前 UI 展示最近 50 个任务，完整结果可按现有 JSON 能力检查。不是全领域持久离线队列，也没有自动冲突合并。

当前普通笔记约束 5,000 字符，研究提议 400,000 字符/20 引用；修改前核对源码/schema和测试。

工具区 AI 协作先提供表单字段候选，接受填表后实际生成/运行仍需用户动作。源选区/输入变化不能继续套旧候选。

### 旧论文迁移

历史位置 <DSH_HOME>/paper-guide，当前为 <DSH_HOME>/mimir-workbench/paper-guide。

paper-migration.js 复制并保留旧目录，涉及 migrations/paper-guide-before-core-v1、documents.pre-core-v1.sqlite 和身份映射。哈希不一致、多项目不兼容、旧写入者未关等情况应拒绝迁移，先查原因。

身份损坏应恢复原 UUID，不能删 identity.json 重新生成以掩盖问题。

### 数据跨电脑迁移

程序包与用户资料分开。测试新包无需带开发者资料。

迁移用户数据先正常退出，备份完整目录。活动 SQLite 不能只拷贝 .sqlite，需处理 WAL/SHM 或正确 checkpoint。保留身份、会话、文件、论文和研究结果。

model.secret 是 Windows CurrentUser DPAPI 密文，换电脑/账户通常需重新输入 Key，不能承诺可直接复用。

主题还在浏览器 localStorage，不仅在服务目录；换浏览器/机器往往需要重新选色。递归删除/移动前检查绝对目标范围，不对未确认计算路径操作。

## 9. 接口、模型与本机边界

文稿/工具路由通过 ctx.connection.fetch.register，复用已认证连接，不能旁路建立未保护服务。

主要路由：

~~~text
/api/mimir/document
/api/mimir/files
/api/mimir/files/import
/api/mimir/file
/api/mimir/tools
/api/mimir/ai/models
/api/mimir/ai/model/select
/api/mimir/ai/suggest
/api/mimir/ai/assist
/api/mimir/latex/annotations
/api/paper-guide/open
~~~

文稿 save/propose/authorize/apply/reject 具体路径/请求以 host-entry.js 注册与 schema 为准。返回含 ok/data/error/requestId 等结构，部分接口不同，不复制旧测试 payload 当新契约。

论文阅读器是能力链接/iframe服务，检查 parent origin、消息 source/owner和资源白名单，使用 X-Paper-Guide 等协议标记。增加 reader 模块必须同步资源白名单。

退出控制绑定单独的 127.0.0.1 随机端口，检查 Host、无外部 Origin 与 X-Mimir-Control。UI端口与控制端口不可混用，不能开放到局域网。

当前认证不等于多用户 ACL；本地代码执行是用户权限，非沙箱。每文件当前上限 50 MiB；其他表单/提议/证据有各自限制，调大前评估内存/超时和保护测试。

### 共享模型

论文、文稿、研究共用 agentDefaultModel 与真实模型目录。

- ai/models 获取目录；ai/model/select 提交真实 provider/model。
- 从目录选 ID，不自行拼 deepseek-pro 等名称；此前测试错误 payload 已按接口纠正。
- 首次缺省 deepseek-official / deepseek-flash / reasoningEffort high，不覆盖已保存选择。
- 科研预设 mimir-research 是唯一产品运行层入口。
- policy.yml 禁用 llm-deepseek-account、ui-trajectory。
- Key 由启动器 DPAPI 加密，经标准输入传 Node，不放命令行或共享明文状态。
- 更换凭据按启动器流程重启；无 Key 不影响所有本地功能。

不要硬编码历史代理 127.0.0.1:7890。合作伙伴在线模型/文献需其网络与账户，离线工具无需重新安装依赖。

## 10. 当前前端风格与实现细节

### 主题

product-theme.js：localStorage键 mimir.appearance.v3，兼容 mimir.appearance.v2。迁移保留各空间 palette，旧研究 mode 转为全局。

| 空间 | 默认 |
| --- | --- |
| conversation / 研究探讨 | graphite / 石墨 |
| paper / 论文导读 | blue / 雾蓝 |
| workbench / 文稿工作台 | sand / 砂岩 |

另可选 iris / 鸢尾。全局默认 light；改 dark 后三空间共同变化。不能重做成分页面明暗。

body data-mimir-space、data-mimir-palette、data-mimir-mode 配合 --mimir-* 变量；论文 iframe有主题桥，必须内外一起验收。

正常重启优先复用 UI 端口，同浏览器 origin 保留偏好。端口占用变更 origin 可能影响 localStorage；尚未做跨 origin偏好迁移，不承诺这一边界同步。

### 排版与折叠

研究空间有宽松主标题、窄主导航、可折叠项目目录和输入/对话主区域。论文以原文阅读为中心，目录和助手分别收起；文稿以正文为中心，导航与审阅独立收起。

工具文件、编译资源和协作等默认局部折叠。保持控件挂载与输入/草稿/选区，不能因折叠销毁状态。正文/PDF阅读平面不叠粒子。

真正的分组才使用容器，其他区域依靠留白、细分隔、层级及滚动；避免层层卡片。

### 光场、粒子、视差

论文/文稿当前为 14 环境点+6流动点，两条宽弧、约32/41秒周期及短尾迹。0.11.2密集页边流/信号带/全轨迹线已撤，用户认可背景质感但否定杂乱粒子，不恢复旧版。

研究空间粒子响应入口/焦点/指针作视觉引导；论文/文稿采用更安静的独立曲线，不能盖住文字。

光场与纹理提供背景深度，微弱视差不等于每个控件都追鼠标。Canvas pointer-events:none，不阻碍选字、高亮、点击/滚动。考虑 reduced-motion、隐藏页和循环清理，不靠大量粒子/模糊增加负担。

### 过渡

0.11.4已修正整页缩放/垂直移动/模糊叠加的晃动。当前小幅水平位移约退出-12px、进入18px，320ms量级，采用 view transition/兼容路径。

导航指示复用同元素移动；快速切换取消过时动画，减少动态模式同步最新状态；保持编辑器/阅读器生命周期。

旧CSS保留早期定义，读最终覆盖规则，不按第一条匹配误改。不能再次加入整页上下弹跳、强缩放或大量fade/blur。

按钮、入口和聚焦轻深度反馈，不能拖慢点击/键盘焦点。

### 字体与滚动

UI优先本地 Segoe UI Variable Text / Segoe UI / Microsoft YaHei / PingFang SC。标题/阅读局部衬线回退，代码等宽。中文衬线可能回落 SimSun，不能假定所有 Windows 都有 Noto/思源。

控件/小标题约600，高层650/700，正文适宜行高；不全局加粗，也不依赖外部字体下载。

原生滚动条可见约10px，长列表稳定gutter；检查flex子项min-height/min-width/overflow，避免长表单截断。侧栏、论文、文稿、设置、审阅需各自可滚动。

### Figma

历史可编辑参考：https://www.figma.com/design/Kg1C9oBmlTRMpmPGlNPPSg

见 [0.11.1](docs/UI_ACCEPTANCE_0.11.1.md)：研究空间深浅参考、文本/向量层及动效参数。Figma服务端字体替代不等于产品字体变更。

0.11.2只增加两块空参考框后遇额度，不宣称后续论文/文稿全部在Figma审查。当前代码、最新截图与实机验收更权威。新环境连接/登录/额度重新检查。

## 11. 已修复功能问题

0.11.4：高亮保存未绘制、翻页缩放回跳、长表单截断/缺滚动、叠加过渡晃动、内嵌浏览器论文导出与Windows短暂文件占用；全局明暗及字体增强。

0.12整包自检：

| 问题 | 修复 |
| --- | --- |
| 新研究使用旧 Documents/deepseek-harness cwd | 服务就绪前通过registry首次空历史初始化Mimir路径；不移动已有研究 |
| 重命名无初始标题/空研究不更新 | RC2两参数调用与保存title，界面取消不写、确认立即更新 |
| Python冷启动失败走旧联网安装 | 固定内置Python、更充分探测，失败显式错误 |
| 中文TeX输出jobname无效 | 规范首字符，真实中文/公式PDF通过 |
| 文稿Blob下载在内嵌浏览器不可靠 | 受保护HTTP文件通道，最新快照、防重复、失败可重试 |
| 随机端口重启丢外观 | 保存优先复用端口，占用安全回退 |
| prerelease被清单拒绝 | 支持合法SemVer prerelease，保留非法拒绝 |
| 轨迹仍装配 | bundle及产品策略禁用 |

高亮“能显示”与“直接取消/一步撤销”是两个问题，后者未完成。

## 12. 未完成与下一阶段建议

以下为接手优先级建议，不代表文档任务已授权立即开发。

### 首先：高亮取消/撤回

用户明确“下一版本改，先做整包”。当前保存/恢复通过，批注页有通用删除，后端删除已验证，但缺阅读区清晰直接取消与一步恢复。

下一版需界面完整验证：

1. 已保存高亮可发现/选中，动作与结果明确。
2. 区分草稿放弃、保存记录删除和可恢复撤销，不换名称冒充。
3. 成功立即同步显示；失败/冲突不留假成功。
4. 误操作能恢复，范围/批注/身份正确。
5. 跨页、缩放、定位、折叠、刷新/重启一致。
6. 连续增删不留旧矩形/版本。
7. 实际UI添加、取消、恢复、重新添加及持久化，不能只测API。

### 其他闭环

- LaTeX行批注缺编辑/删除/恢复。
- 工作区文件缺移除；先处理论文/引用/任务使用关系，禁止无保护硬删。
- 富文本批注已解决后缺恢复未解决；正文Ctrl+Z不是同一能力。
- 论文通用删除原生确认窗口取消/确认，未完成UI自动化闭环。

### 桌面/跨机

托盘、首次Key窗口、改Key重启、无Key本地使用；另一台Win64、不同用户名/中文空格路径/普通权限、离线/受限网络；浏览器关闭与后台退出、二次启动、端口占用、异常中断。

当前启动器未签名，合作伙伴Key付费调用及其网络未测。不得将本机headless通过替代真实桌面/另一台机器。

### 能力边界

无内置OCR、Bash需外部环境、无GPU深度学习、非全出版社模板、任务无自动续跑、无完整多用户ACL/多项目文稿映射、无全领域离线队列/自动合并、无完成的自动升级回滚。

## 13. 验收与证据

权威报告 [WINDOWS_BETA_ACCEPTANCE_0.12.0-beta.1.md](docs/WINDOWS_BETA_ACCEPTANCE_0.12.0-beta.1.md)，日期2026-10-04。本次交接重新核对源码/版本/文件与ZIP哈希，未重跑整套功能。

### 已验证

- 仓库319+分发4，共323检查通过；类型检查、工作台和bundle构建通过。
- 完整回归使用包内Python，59依赖版本检查通过。
- TS用tsc，部分JS为node --check、Python为compileall；不声称所有JS严格类型检查，Core/contracts未全面checkJs。
- 解压包 Mimir.exe --headless实际启动，PATH最初仅Windows System32，中文/空格目录；不依赖开发机运行时搜索路径。
- Word、Python/Pandas、PowerShell、PNG/PDF/SVG、中文XeLaTeX真实生成/下载。
- 合成两页PDF真实解析，高亮/缩放/阅读位置持久化。
- 未认证、跨源写入、控制凭据/外部Origin负面检查。
- ZIP全部CRC/SHA、清单/重复名称，共64,079文件。

### 界面通过

研究重命名取消/确认、搜索、置顶/归档恢复；设置收敛、主题、各侧栏折叠；正文输入撤销重做保存重开、MD/TeX实际下载；论文搜索定位、添加/编辑/放弃批注；后台重启主题/模型/文稿/论文/文件恢复。

论文删除确认窗口未完整UI验证；后端删除不能替代。正文撤销也不能替代高亮撤回。

### release证据

~~~text
tests-beta-complete-final.log
tests-distribution-final.log
typecheck-beta-final.log
product-acceptance-offline-final.log
product-acceptance-0.12.0-beta.1.json
persistence-final.log
verify-final-zip.log
package-final-hash.log
mimir-beta-user-acceptance.png
acceptance-input.pdf
~~~

位于 D:\Mimir\release，不随源码自动迁移。早期tests-beta-final.log曾因误用系统Python缺PIL失败，模型测试payload也曾错误，最终已纠正；保留区别，不将旧失败当当前失败或删掉假装没出现。

0.11.4有历史真实在线回复/导读与TeX验证；0.12整包未付费在线调用。按版本标注，不混用。

release\交付用户 数据、最终使用 验收、首次离线 验收为合成验收目录，非包内资料或可默认删除的数据。

## 14. 新环境开发与构建

### 恢复环境

Node24、pnpm11.21.0，根pnpm-lock/workspace配置。用完整包内Python测试，不把系统Python/node_modules/旧venv当可移植输入。C#构建需.NET Framework csc。

下列路径换成新环境真实位置，逐项检查退出码：

~~~powershell
Set-Location 'D:\Mimir\mimir'
git status --short
git log -1 --oneline
node --version
pnpm --version
pnpm install --frozen-lockfile
$env:MIMIR_PYTHON = 'D:\Mimir\release\Mimir-0.12.0-beta.1-Windows-x64\system\python\python.exe'
$env:PYTHONNOUSERSITE = '1'
$env:PYTHONUTF8 = '1'
pnpm typecheck
pnpm test
pnpm test:distribution
pnpm build
node packages/dsh-workbench-bundle/scripts/verify-client.mjs
git diff --check
~~~

根命令：

- dev：workbench-preview，FakeLocalWorkbenchPort模拟，非真实保存/权限/论文服务。
- build：依次plugin-workbench、preview、bundle。
- test：仓库聚合；test:bundle：独立Host；test:distribution：环境/端口；typecheck：各包检查。
- smoke:dsh：历史profile烟测，先检查路径/修改行为，不能对当前用户home随手执行。

### 构建坑：旧dist

Workbench改后必须先build plugin-workbench，再build bundle。build-client.mjs消费前者dist/index.js/style.css；仅bundle build可能成功却打进旧UI。首选根pnpm build，然后verify-client再pack。

### 生成物

- src/host-entry.js构建host/index.js。
- src/unified-entry.js构建host/unified.js。
- src/diagram-layout-worker.js构建host/diagram-layout-worker.js。
- src/client-entry.js构建lib/client.js。
- client以window.__ModuleLoader__.load注册CJS factory，React/宿主模块external，不能引入第二份React。
- paper-guide资源复制到bundle/paper；file-tools、figures、TeX模板同样复制。
- 修改权威源，不只改副本/压缩client；生成物当前参与交付和版本管理，确保源产物一致。

### 旧文档版本

LOCKED_VERSIONS.md、bundle README部分仍有0.9.1/0.11.4、插件安装或首次联网说明。package.json、distribution/product.json、锁文件及最新验收优先。

新版本检查bundle package、mimir.plugin.json、CHANGELOG、distribution product/engine lock、tgz校验、生成client版本、inventory及使用说明。不能只换ZIP文件名。


## 15. Windows整包重建

详见 [distribution/README.md](distribution/README.md)、[分发方案](docs/superpowers/specs/2026-10-04-mimir-windows-distribution-design.md)。

### 输入

- 官方Node24.16.0 Win64目录与LICENSE。
- 官方CPython3.12.10 x64完整运行目录（exe/DLL/标准库/许可证）。
- MiKTeX25.12完整便携树与对应官方源码归档。
- 当前源码构建的bundle tgz。
- requirements-windows.txt精确锁定59 Python依赖。
- engine-package-lock.json锁npm；含其他平台optional，锁条目数不等于实际安装包数。
- 首次组装可联网访问公共包源；收件人本地功能不再装依赖。

未知用户home不能作为“干净包”运行输入。完整TeX体积是当前离线能力与许可证内容结果，未设计缩包范围/回归前不删字体、宏包、doc/source。

### 命令模板

先根构建/验证，再pack：

~~~powershell
Set-Location 'D:\Mimir\mimir'
pnpm build
node packages/dsh-workbench-bundle/scripts/verify-client.mjs
pnpm --filter @mimir/dsh-workbench-bundle pack --pack-destination 'D:\Mimir\release'
~~~

替换占位路径，以全新Output调用：

~~~powershell
.\distribution\scripts\assemble-windows.ps1 -Output '<新的分发目录>' -Bundle '<当前tgz绝对路径>' -NodeRoot '<官方Node目录>' -PythonRoot '<官方Python目录>' -TexRoot '<完整便携MiKTeX目录>' -TexSource '<对应官方源码归档>'
~~~

脚本拒绝覆盖已有目录，安装锁依赖、编译x64启动器、检查Python、实际中文TeX，再生成inventory/ZIP/SHA。

C#编译器通常在 %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe；需新机确认，使用绝对输入源路径。

### 收尾增量更新

- sync-bundle.mjs：同步变化bundle/tgz并更新分发和相关lock校验。
- refresh-package.mjs：更新变化条目/inventory/ZIP哈希，保留其他压缩内容。
- update-zip.ps1：ZIP条目辅助。
- sync-extracted.py：校验后同步明确验收副本。
- verify-zip.py：每次更新验证整个ZIP。
- verify-package.py：完整独立解压逐文件SHA。

完整重压64K文件耗时较长；增量是效率手段，不减少最终验证。读取脚本实际参数；先正常停止测试实例再更新，不同步真实用户运行目录。

## 16. 运行环境隔离与排错

environment.mjs清除继承的DSH_、MIMIR_、MIKTEX_、FONTCONFIG_、DEEPSEEK_、PYTHONHOME/PYTHONPATH，再显式设置产品环境，防止开发机污染。

MIMIR_BUNDLED_RUNTIME=1，MIMIR_PYTHON/PARSER_PYTHON/MCP_PYTHON均为包内路径。禁用户site、UTF-8，缓存写home。

整包Python探测当前允许120秒冷启动，旧私有环境路径约20秒级；失败显式MIMIR_RUNTIME_SETUP，不联网创建替代Python。缺包内XeLaTeX同样报明确错误。旧独立插件自动依赖分支可仍存在，但非整包使用方式。

MiKTeX用户配置/数据指向home/tex，安装树在包内；startup.ini/miktex.ini/字体缓存不写系统安装。

重要经验：仅设置FONTCONFIG_FILE不足。字体配置实际位于home/tex/config/fontconfig/config/fonts.conf，含Windows Fonts及包内TeX字体，缓存home。避免迁移后中文字体失败。

server.json记录UI端口，优先复用；占用回退。控制端口另生成，不混用。

逐层诊断启动器、Node服务、bundle、Host、Python/TeX。不要通过清数据库/profile/身份“修复”。

## 17. 发包前用户角度自检

用户明确要求彻底自检，防止“能加不能撤回”。下一版以下流程应为交付门槛。

### A. 包体与静态

版本一致、锁定依赖、构建/测试通过；无Key/开发者数据；所有CRC/SHA/清单一致；无依赖缺失或开发机链接；许可证保留。

~~~powershell
& '<包根>\system\python\python.exe' distribution/scripts/verify-zip.py '<候选ZIP>'
& '<包根>\system\python\python.exe' distribution/scripts/verify-package.py '<候选ZIP>' '<全新独立解压父目录>'
~~~

verify-package第二参数是父目录，ZIP内自带一个产品目录；已有完整副本需明确--existing，不用含其他资料的目录。

### B. 干净启动/接口/真实输出

用解压副本、全新合成home、最初仅系统PATH启动。--headless仅接口验收，跳过GUI/凭据，不能替代桌面。

~~~powershell
Start-Process -FilePath '<解压包>\Mimir.exe' -ArgumentList '--headless --data-home "<新的测试home>"' -WindowStyle Hidden
& '<解压包>\system\node\node.exe' distribution/scripts/smoke-product.mjs '<测试home>\instance.json' '<两页合成PDF>' '<新验收报告JSON>'
~~~

smoke-product修改文稿/模型、导入PDF、生成文件/提议；只在一次性home，绝不对真实用户数据使用。

核对文件正文/PDF输出，不只HTTP200。真实Python、PowerShell、Word、图表、中文空格路径TeX、下载、认证与过期写入拒绝，不调用付费模型。

### C. 界面完整闭环

逐功能：进入、创建/导入、编辑、保存、取消/撤回/删除、导出、离开再进、刷新/重启。

- 研究：新建、重命名初值/取消确认、搜索、置顶、归档恢复。
- 文稿：格式/公式、选区、批注、建议拒绝/接受、保存/冲突、撤销重做、导出最新正文。
- 论文：解析失败可理解、搜索定位、翻页缩放、批注添加编辑放弃、高亮取消恢复、删除确认取消、折叠/滚动。
- 工具：候选填表、运行/取消、错误重试、防重复点击、资源下载、长输出滚动。
- 主题：明暗全局/色调独立、iframe同步、重启。
- 交互：快速切换无晃动、光标焦点不丢、粒子不挡选字/滚动、reduced-motion可用。
- 未来文件移除：依赖/引用/任务检查、取消确认、恢复，避免悬空引用。

### D. 退出/重启

通过对应实例控制接口/托盘正常退出，等待真正停止后同home重启。仅对自己新建测试实例用下方模板，不输出控制凭据：

~~~powershell
$mimirTestState = Get-Content -LiteralPath '<测试home>\instance.json' -Raw | ConvertFrom-Json
Invoke-WebRequest -Uri ("http://127.0.0.1:" + $mimirTestState.controlPort + "/exit") -Method Post -Headers @{ 'X-Mimir-Control' = $mimirTestState.controlToken }
~~~

重启后：

~~~powershell
& '<解压包>\system\node\node.exe' distribution/scripts/check-persistence.mjs '<测试home>\instance.json' '<该轮smoke报告JSON>'
~~~

脚本依赖同轮合成内容/报告，不能对任意用户数据使用；覆盖文稿/模型/论文/高亮/位置/文件，另查浏览器主题与原生桌面。

报告分别列自动、接口、UI、原生及另一台机器。没完成的闭环明确写出。

## 18. 跨环境需要迁移的材料

### 开发交接必需

1. 主仓库源码与Git历史，含pnpm锁、distribution、docs、当前生成物。
2. 本文件、最新验收/待办，不依赖旧对话才能理解。
3. 当前ZIP和.sha256，直接复验。
4. 内部tgz核对输入；下一版从源码重建。
5. release关键日志/报告/合成PDF/截图。
6. 若需重建整包，官方Node/Python/MiKTeX目录及对应MiKTeX源码，或按锁版本重新获取。

不用拷node_modules/旧venv当规范。新环境替换本机绝对路径，检查脚本残存D:位置。源码有构建依赖与离线wheel内容，不能只带src片段。

### 不随开发材料带走

API Key、model.secret、带token的instance.json、真实研究/论文/身份资料、浏览器cookie/登录、代理凭据。用户若另要求资料迁移，按第8节单独受控迁移，不混入测试包。

Figma/Codex/Skill/联网账户在新环境重新检测，不复制凭据。

D:\Mimir\release是本机定位，仓库相对链接可随源码迁移。只带源码没有release不能说已复验现有包。

### 历史会话

用户引用的早期工作台任务，标题开头“这是项目交接文件，我准备让你负责科研工作台的设计与事前，最终形式以插件方式交付…”，local threadId：

    01a0dc4b-912b-7132-a785-98b410ee211f

本次已read_thread。新环境若依赖具体内容仍需read_thread，引用标题不是内容，local任务可能不可访问。

该旧对话是早期背景；后来统一产品、前端要求和整包交付覆盖冲突部分。本交接已保留当前关键结论，不需要新agent先反复遍历全部聊天。

## 19. 推荐下一阶段

1. 核对源码/包/数据/证据，干净启动已有包。
2. 对齐当前用户任务；继续下一版时先高亮取消/可恢复闭环。
3. 补LaTeX/正文批注及文件移除，考虑版本/引用/失败恢复。
4. 补真实托盘/Key/另一台Win64，收合作伙伴反馈。
5. 新版构建、独立解压、全包校验、闭环报告，保留上一版可回退。
6. 仅用户明确要求才扩到多项目数据域、harness架构、自动升级或大规模重写。

不要修一个入口就换编辑器、丢Core、重写研究层或全站再设计。当前功能可靠与闭环更重要。

## 20. 文档权威及阅读顺序

先读：

1. 本HANDOFF。
2. [整包验收0.12](docs/WINDOWS_BETA_ACCEPTANCE_0.12.0-beta.1.md)。
3. [BETA_BACKLOG](docs/BETA_BACKLOG.md)。
4. [分发工程](distribution/README.md)、[用户说明](distribution/README-用户说明.txt)。
5. [0.11.4](docs/UI_ACCEPTANCE_0.11.4.md)：功能修复、全局明暗、字体与滚动。
6. [0.11.3](docs/UI_ACCEPTANCE_0.11.3.md)：折叠与慢曲线粒子。
7. [0.11.1](docs/UI_ACCEPTANCE_0.11.1.md)：Figma与动效背景。

需要数据/历史设计再读：

- [统一方案](docs/superpowers/specs/2026-10-03-unified-plugins-design.md)
- [统一0.9.1交付](docs/UNIFIED_0.9.1_DELIVERY.md)
- [产品质量计划](docs/PRODUCT_QUALITY_PLAN.md)
- [0.8.1审查](docs/REVIEW_REPRODUCIBILITY_0.8.1.md)
- [AI协作](docs/AI_COLLABORATION_VERIFICATION.md)
- [文稿/TeX自检](docs/OVERLEAF_SELF_CHECK.md)
- [旧交接存档](docs/history/HANDOFF_2026-10-04_legacy.md)

旧“未浏览器验收”“首次联网装依赖”“独立插件”“绿色”“分空间明暗”等描述看日期/版本，不能恢复被后续覆盖的方案。

## 21. 下一位agent的完成标准

接手成功不只是能跑预览，而是清楚源/生成物/包关系、用户数据位置、已验与未验边界，并遵守产品决定。

下一版交付需有：具体用户行为修复、可复现原问题、完整闭环验收、版本/产物/包校验一致、干净运行与旧资料升级范围、准确未完成清单、合作伙伴可直接使用的整包说明。

保持现有成果与用户资料；优先实际缺陷。交接建议不是已经完成，也不能凌驾用户新指令。
