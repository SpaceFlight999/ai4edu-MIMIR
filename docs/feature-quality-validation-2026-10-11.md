# MIMIR 功能与 AI 质量验收（2026-10-11）

范围是 `D:/Mimir/ai4edu-MIMIR-20261010` 的原后端、模型接入和已有功能验收。按用户要求，本轮先完成功能与质量检查，暂不重新打包；已有 0.12.8 ZIP 属于旧快照。前端不重建、不改布局，既有文稿审批、候选确认和学生自评流程保留。下表区分功能执行、结构校验和人工内容质量，不把模型请求成功当成高质量证明。

完整证据索引、各报告SHA、已安装源码快照与失败项保存在[最终JSON汇总](../artifacts/final-feature-quality-20261011.json)。最终两个总体标志均为false：界面仍有真实缺陷，AI样本也未全部通过人工审核；检查流程已完成，不等于所有结果合格。

## 已有功能的实际覆盖

| 功能 | 已完成证据 | 结果与范围 |
| --- | --- | --- |
| 原生 Windows 程序、成长、学习、课程、日常、机器人流程 | `artifacts/user-loop-20261010.json` | 9 组中 8 组整体通过；学习组 9 项业务检查通过，390px 导航裁切仍失败。0 浏览器异常、0 付费模型请求。 |
| Word、Markdown、PDF、图表、脚本、LaTeX、BibTeX、研究工具 | `artifacts/workbench-functions-final-20261010.json` | 19 组实际后端工具通过，包含真实生成文件、Python/PowerShell/Bash 执行、PDF 顺序、Word 普通与待接受修订保护、实际 LaTeX 编译。 |
| 研究检索标题核对 | `artifacts/workbench-research-title-followup-20261010.json` | 1 组真实联网结果通过。arXiv 1706.03762 标题 matched；年份 2017，DOI missing，所以整体元数据仍为 partial，未伪装完整。 |
| 编辑器撤销/重做与最新正文下载 | `artifacts/editor-tool-ui-followup-20261011.json` | 4/4 实际界面检查通过；文稿未保存时下载包含最新正文；执行期间二次真实点击只产生一个 runtime.run 请求，exit 0。 |
| 富文本、公式、表格、长输出及论文导入补查 | `artifacts/editor-remaining-ui-final-20261011.json` | 9组中8通过、1个确认缺陷。标题/粗体/斜体/列表/2×2表格实际按钮和合成PDF导入通过；公式实际输入x+y、取消/插入/保存/刷新通过；长输出首尾完整，工具容器真实滚轮0→220及回顶通过。真实键鼠新增段落复制blockId，整份富文本保存返回400 INVALID_ARGUMENT，刷新恢复未验证；后端身份校验没有放宽，原前端保留。 |
| 当前没有提供的界面能力 | 编辑器工具4组及剩余UI汇总 | 工具取消/停止和整篇论文/源文件删除均为 unavailable，未计通过；关闭论文页签不等于删除。长输出没有专用有限高度内框，实际通过的是现有工具容器滚动。 |
| 会话管理 | `artifacts/session-management-followup-20261010.json` | 7 组实际界面通过：命名/取消、独立会话、查询、置顶、归档/恢复、刷新、重启。 |
| 论文问答历史与保留期限 | `artifacts/paper-question-history-followup-20261010.json` | 13 组通过：删除末项、刷新/重启，失败状态 59/61 分钟边界、成功记录 30 天保留。18 次本机模拟请求，0 付费。 |
| 长论文组合 | `artifacts/paper-long-final-quality-20261010.json` | 15 组、28 次本机模拟请求通过；17+42 页，共263,292字符、2,596证据；各阶段超过55万字符未截断。 |
| 导航、配置、自定义、专题学习、高亮和确认窗口 | `artifacts/feature-followup-20261010.json` | 导航9组、自定义25组均通过；自定义16次本机模拟请求，0浏览器异常，正常自有host/Browser关闭。失败尝试与未知请求数量均保留。 |

每个真实程序检查使用独立合成 home；原用户目录不参与测试。模拟模型只验证状态、取消、保存、引用身份和错误处理。功能/API 检查不自动证明所有按钮已经逐一回放。剩余UI的7轮历史记录和SHA链保留；所有自有浏览器、host已正常停止，0付费、0真实数据读取。第二台干净 Windows 机器、完整托盘/首次 Key 原生窗口和真实硬件不在本轮已完成证据中。

## 真实 AI 内容的审核

所有实际付费请求使用用户已授权的官方原生 `deepseek-official / deepseek-flash`；测试凭据仅临时解密，报告不包含请求头或 Key。每批失败、完整响应和后续修正分别保留；未选择入口标为 not-attempted，不能充入本批分母。

| 样本 | 传输/后台 | 人工内容结论 |
| --- | --- | --- |
| 最新成长 generate/review/import/evidence | `live-growth-selected-quality-20261011.json`：4/4 后台通过、9 次实际 HTTP 200 | `live-growth-selected-quality-review-20261011.json`：2/4 接受。generate/review通过；import标题时长与实际hours矛盾；evidence漏读正确易混概念、summary与状态冲突。旧反馈/研究摘要的已接受样本单列来源，本批没有重跑。 |
| 精确标题时长保护后的共享适配 | `live-growth-import-time-followup-20261011.json`：1次实际请求、后台通过 | 旧标题冲突本次未出现，实际每周1.5/2小时、总3.5小时，分段汇总正确；但一条完成标准把两个90°全局角称为不同，90分钟任务又给出单次≤20分钟的四段选项（最多80分钟），因此人工仍不通过。新标题没有精确时长模式，不能声称本次触发了拦截。 |
| 段落、LaTeX、Word、Markdown | `live-native-writing-final-20261011.json`：4 次实际请求；原脚本误判 Word 为失败 | `live-native-writing-final-quality-review-20261011.json`：3/4 接受。Word 的否定被脚本误读，离线派生只更正判定；Markdown擅自新增 We，真实人工失败保留。 |
| 执行者拦截安装后的Word/Markdown | `live-native-writing-guard-followup-20261011.json`：2次实际请求、2/2后台通过 | `live-native-writing-guard-quality-review-20261011.json`：2/2正文建议接受；Word notes的过去时标签和“仅讨论、未执行”范围表达单列轻微观察，不能据此断言仿真从未执行。旧We失败仍保留，两次新回复未触发拦截。 |
| 原生论文与科研聊天最新批次 | `live-native-selected-final-20261010.json`：6 项尝试、12 次实际请求 | 导读/问答仍有范围过宽或重复；综合仍有3个未解决问题；聊天回复159字符，超过120字要求，并错误解释相对关节90°/90°坐标。正式全文审核与后续说明单独保留，不以 succeeded 抹除。 |

科研聊天实际 UI 路径的请求诊断 `research-chat-request-prompt-diagnostic-20261010.json` 已确认科研 persona、固定连杆规则与20%篇幅余量进入当前接线的实际请求；诊断使用本机模拟服务、0付费。未发现该路径接线错误；它不能充作此前付费请求system文本的重放。真实回复仍违反已给长度与角度要求，也不能靠反复付费抽样取得好回复后宣称稳定。

对于单位杆、平面相对关节角的例子，`x=cosθ₁+cos(θ₁+θ₂)`、`y=sinθ₁+sin(θ₁+θ₂)`，90°/90°是(-1,1)；两杆全局方向均90°才是(0,2)。这项纠错依据机器人学的角度/坐标定义，参见 [Modern Robotics 原始教材资源](https://modernrobotics.northwestern.edu/nu-gm-book-resource/4-1-1-product-of-exponentials-formula-in-the-space-frame/)。真实输出未说明后一种定义，人工拒绝其推导。

## 已内置的提示与后端边界

本轮应用 agent-reach、research 和现有审查技能，联网读取原始教材、MIT课程范围、CMU评价原则、arXiv元数据、Purdue写作指导与研究引用规范。来源、支持范围及归纳规则见 [成长/数值资料](ai-quality-sources-2026-10-10.md)、[写作/研究资料](ai-writing-research-quality-sources-2026-10-10.md)。联网是在本次审核中执行；现有成长 Agent 没有新增网络工具，不虚称每次产品回答已自动联网。

- 成长提示以实际基础、可用时间、完整注册单元与原criteria为边界。计划只允许0-based合法前置任务；严格JSON或完整计划约束失败，最多一次完整重生成，共用五分钟截止；鉴权、网络、取消不重试。当前两周的时间、范围与路线由最终任务生成。注册标题与规范单元统一；非注册标题的明确“分N次M分钟”总量与hours不一致时严格拒绝，允许普通舍入、跳过非精确上下限/约量；任意objective/criteria的语义时间不由该窄检查证明。成果摘要只复述checks计数、提示核查，不强行把错误评分改为supported。
- 论文四阶段分别约束分析、综合、复核、一次修复。请求包含paperId/version/hash/parserVersion，修复接收结构化issues；处理覆盖信息不冒充作者事实，同源完全重复不直接通过。unknown是当前引用不足，不据此断言作者没有做。
- 写作提示保留动作、执行者、时态、数量、ideal与仿真/实物限制。说明必须对应实际patch。新增第一人称过去动作的窄拦截保留原身份范围、中文我→I合法翻译、显式正向身份要求；否定要求不能作为授权，I/We不能自行互换。原选区和Word待接受修订保护仍执行。
- Windows启动配置仅对EBUSY/EPERM做有界重试，最多9次、总等待1.1秒；其他错误/平台直接返回原错误。修复同时进入源码安装变换，原始基线在内存应用变换后逐字重现当前环境文件，重复安装不漂移。

提示、窄校验和人工审核各有适用范围。特别是evidence逐项语义评分、论文引用的全称范围以及聊天数值解释仍有真实失败，不作自动学术验收保证。对应详细记录：[成长](ai-growth-quality-followup-2026-10-10.md)、[论文/聊天](ai-research-quality-followup-2026-10-10.md)、[写作](ai-writing-action-followup-2026-10-10.md)。论文/聊天的六项全文审核已落盘 `artifacts/live-native-selected-final-quality-review-20261010.json`；其中Word旧样本通过，其余五项具体问题未抹除。最新import完整审核 `artifacts/live-growth-import-time-quality-review-20261011.json` 仍为false，源SHA未变；其角度结论是依据 [MIT原始讲义第2页](https://ocw.mit.edu/courses/2-12-introduction-to-robotics-fall-2005/c8828a16e71c246b78461dd0596b983f_chapter4.pdf)定义/公式独立代入，不冒充教材原页的现成算例。

## 最终安装与保留核验

最新修复安装后，本地回归258/258通过，0失败、取消或跳过；43个安装覆盖文件SHA与清单一致。完整运行文件核对 `artifacts/runtime-verification-final-20261011.json` 已完成：64,078个原清单条目与43个覆盖文件检查，0失败、0修复、0基线差异；50个搬迁后生成的Python缓存仅在对应.py仍匹配原始SHA时接受，未豁免源文件。原始输入核验 `artifacts/final-preservation-20261011.json` 通过：33个前端文件、71个合作方数据文件、原始ZIP均未改变，packaged=false。此前检查期间修改了environment.mjs导致单一旧覆盖记录过期，已另存 `runtime-verification-invalidated-20261011.json`，不作为最终验收。历史单元启动共享占用失败也保留为 `unit-tests-sharing-failure-20261011.json`。

启动使用本工程 `Start MIMIR.cmd`。源码改动后通过 `Install MIMIR.cmd` 安装并重启宿主；在运行中的旧会话上下文不会自动替换。当前资料不是重新生成的发布ZIP。原前端、71个合作方数据文件与原始ZIP的SHA保留核验单独完成，测试home和凭据不作为用户数据迁移内容。
