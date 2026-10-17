# 2026-10-11 小幅功能修补与 AI 质量规则：原始资料依据

本笔记只做源码与原始资料核对，不是功能验收报告。没有修改生产文件、启动产品、运行测试或调用付费模型。修补范围遵守用户最新授权：沿用前端风格，可增添少量功能按钮，不调整布局。以下“建议”均是对资料及本地实现的工程推导；资料本身不能证明产品已经修复。

调研使用 research、agent-reach：Exa 第一次搜索找到 Tiptap 官方 UniqueID 文档，第二次返回免费额度限制；Jina 官方文档阅读未成功，于是转官方网页和项目上游源码。Agent Reach 更新检查也因 GitHub API 限流未成功，没有安装、更新或配置付费搜索。

## 1. 编辑器段落身份：明确是 Tiptap / ProseMirror 自定义扩展

本地 `growth/overrides/workbench/client.js` 含 `mimirBlockIdentity`。它为 paragraph、heading、blockquote、listItem、tableCell、tableHeader 定义 `blockId`，用 `data-block-id` 导入／输出；未覆盖 `keepOnSplit`；`appendTransaction` 只在 `!node.attrs.blockId` 时补 `crypto.randomUUID()`。同一 bundle 的属性默认值是 `keepOnSplit:true`。这直接说明拆分后已有的重复 ID 不会被补空逻辑修复，并与已记录真实键盘新增段落后保存 400 的证据一致。后端 `growth/overrides/host/index.js` 的 `annotationIssue` 明确拒绝空或重复 ID，这是注释与修改目标定位所需的约束。

原始资料：

- [Tiptap UniqueID 官方文档](https://tiptap.dev/docs/editor/extensions/functionality/uniqueid)：节点身份应覆盖拆分、合并、撤销／重做和粘贴；可配置节点类型与属性名称。它支持需求依据，不代表当前项目已经使用该扩展。
- [Tiptap 属性默认值源码](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/core/src/helpers/getAttributesFromExtensions.ts)：全局属性默认 `keepOnSplit:true`。
- [Tiptap splitBlock 源码](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/core/src/commands/splitBlock.ts)及 [getSplittedAttributes 源码](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/core/src/helpers/getSplittedAttributes.ts)：拆分命令获取允许继承的属性用于新节点。
- [ProseMirror 插件规范源码](https://raw.githubusercontent.com/ProseMirror/prosemirror-state/master/src/plugin.ts)：`appendTransaction` 接收旧状态、新状态与事务，可追加事务；后续插件追加事务时还可能再次调用，因此身份修复必须幂等。

建议：在现有身份属性设置 `keepOnSplit:false`，并在现有事务插件处理中兼顾缺失与重复身份，保持已存节点 ID 稳定。粘贴到原节点前方时不能简单“文档里第一个出现者保留 ID”，否则可能把原注释锚点转移给复制品；要结合旧文档与事务映射确认旧节点。既有历史重复文档的导入策略也要明确，避免默默重锚注释。保留后端校验，不通过放宽唯一性解决保存。

验证建议：真实 Enter 在头／中／尾拆分、标题转段落、列表拆分、表格单元编辑、复制粘贴到原节点前／后、撤销／重做、保存／刷新；同时检查旧注释仍指向原节点。

边界：在线源码是上游当前版本，不能视为本地精确依赖版本；本地 bundle 已直接确认相关行为。无需为此引入前端依赖升级或改布局。

## 2. 取消网页请求不等于停止后端脚本

[WHATWG DOM 的取消规范](https://dom.spec.whatwg.org/#aborting-ongoing-activities)说明 API 必须接受并观察 AbortSignal 才有取消语义；Promise 本身没有内建取消。[WHATWG Fetch](https://fetch.spec.whatwg.org/#fetch-method)规定 fetch 的取消行为，[MDN AbortController.abort](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort)说明它可以取消 fetch、响应体消费及流。这些接口没有承诺远端业务已回滚或脚本进程已停止。

[Node.js 子进程官方文档](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options)说明 spawn 的 signal 需要显式传入；`kill()` 或 `killed` 不是进程已经退出的证明，`close` 才对应进程结束且 stdio 关闭；结束父进程也不总能结束其后代。[Microsoft taskkill](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)定义 `/PID` 精确目标及 `/T` 子进程树范围。

本地 `growth/overrides/host/index.js` 的 tools 路由将 `request.signal` 传给 `tools.run`，runtime.run 再传给 `runLocal`；它具备下层取消入口。`growth/overrides/host/unified.js` 还有按自有 ChildProcess PID 停止进程树的逻辑，但不能据此推断工具 HTTP 请求链已经在断开时触发相同逻辑。

建议：沿用既有按钮样式增加“停止”，同时明确后端运行 ID 与自有 AbortController 的对应关系；可用显式取消接口，或证明网络层确实把请求断开传递给控制器。只中断客户端 fetch 后应显示“请求已取消”，不要提前显示“进程已停止”。确认自有进程退出后再进入 cancelled 状态；完成与取消竞态要有稳定结果。运行过程中写出的文件不能宣称自动回滚。

验证建议：长脚本停止后不得继续产生标记文件；UI 恢复可操作；不影响另一运行；多次停止幂等；已经完成的运行不被事后误标取消。进程树处理只限本次 owned PID，不按程序名批量结束进程。

## 3. 相对关节角、固定几何输入与评价标准

[MIT 2.12 H. Harry Asada Chapter 4](https://ocw.mit.edu/courses/2-12-introduction-to-robotics-fall-2005/c8828a16e71c246b78461dd0596b983f_chapter4.pdf)第 2 页定义 θ₂ 为相邻两杆夹角，式 4.1.1–4.1.3 使用累计方向 θ₁＋θ₂、θ₁＋θ₂＋θ₃。已查看该页图示和公式。针对同一角度约定的 2R 情况，以下是从前两杆直接推导的本项目检查式，不是声称教材逐字给出的 2R 测例：

`x = L₁ cos θ₁ + L₂ cos(θ₁+θ₂)`

`y = L₁ sin θ₁ + L₂ sin(θ₁+θ₂)`

因此相对角输入 `(0°,90°)` 与 `(90°,0°)` 的第二杆全局方向均为 90°；末端分别是 `(L₁,L₂)` 与 `(0,L₁+L₂)`，差别来自第一杆／肘点。单位杆输入 `(90°,90°)` 的末端为 `(-1,1)`。如果两杆输入都是绝对全局方向 90°，单位杆末端才为 `(0,2)`；不能交换约定。输入采用弧度时按原单位计算，不自行改为度。

建议内置规则：先记录角度相对于哪个坐标系，再累计方向；保留已给长度和单位，针对固定几何输入不要附加无质量、无重力、无摩擦等动力学条件。只有关节范围、碰撞或受力本来就是问题的一部分时才检查相应条件。已给固定长度并不否认刚体建模假设，只是不需要再以动力学条件作为坐标成立前提。

[CMU Eberly Center 评价、目标与教学活动对齐](https://www.cmu.edu/teaching/assessment/basics/alignment.html)支持评价应衡量原学习目标。应用推导：按原 criteria 逐项对照用户成果，认可符号式与数值式等数学等价答案；不能用后来新增的实物实验、图表或额外假设扣分。知识性建议应放在下一步建议中。资料不保证模型自动评价可靠，不能把分数自动视为完成证明。

时间预算可用独立算术检查：90 分钟、每次最多 20 分钟需要至少 `ceil(90/20)=5` 次；“4—5 段”仍含不可行下限，不能仅规范化标题后保留目标／理由／roadmap 的矛盾。

## 4. 引用可定位不代表覆盖完整论断

[ICMJE 参考文献指导](https://www.icmje.org/recommendations/browse/manuscript-preparation/preparing-for-submission.html#references)要求引用准确且支持相应陈述，尽可能直接引用原始研究。其正式适用领域是医学论文；本项目借用引用支持原则，不声称它为所有研究自动生成器定义算法标准。[W3C PROV-DM](https://www.w3.org/TR/prov-dm/)提供来源、派生与归属的表达依据，但 provenance 只能说明来源链，不能单独证明断言为真。

[W3C OWL 2 Primer](https://www.w3.org/TR/owl2-primer/)第 2 节解释开放世界语义：信息未出现可能只是缺失，不能直接当成假。这里将该逻辑原则应用于不完整论文引用集合，属于工程推导；本项目并没有实现 OWL 推理器。

建议内置规则：两行证据可支持这两行的内容，不能支持“其余各行均没有”“全文未讨论”这样的全量结论。没有足够覆盖时，改为“当前引用中未见，无法据此判断全文”，并把 kind/status 及实际措辞一起变为 unknown/范围受限；仅改枚举而保留“作者没有陈述”仍不合格。逐项验证复合句中的每个事实、比较方向、数字、单位和范围；known evidenceId 只证明引用存在。作者明确陈述没有做某项工作时可以保留有证据的否定，不机械抹掉。

验证建议：给同文 44 行仅两行引用时拒绝“余行均”；扩大到完整相关区段后仍检查事实是否支持；明确作者否定句保持原义；推断／建议不伪装作者原话；unknown 的审查修补不得只要求再次改为 unknown。

## 5. 完整 Unicode 回复长度必须有明确计数口径

[ECMAScript String iterator 规范](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype-%symbol.iterator%)规定字符串迭代按码点进行，`text.length` 是 UTF-16 码元数量。`Array.from(text).length` 可用于按码点计数，避免把补充平面字符拆为两个码元。[Unicode UAX #29](https://unicode.org/reports/tr29/)区分码点与用户可见的字素簇；组合字符或 emoji 序列可含多个码点，但被用户看作一个字符。

建议：本次 AI 字数上限先明确为“完整最终回复按 Unicode 码点计数”，计入中文、拉丁字母、数字、标点、公式标记、空格和换行；不得只统计 CJK 字符或只算正文而漏掉附加说明。提示词保留约 20% 余量，最终后端对实际回复再次检查，超限时做一次受控完整改写，而非截断公式或句子。如果产品要展示用户可见字符数，应统一切换字素簇（例如 Intl.Segmenter 的 grapheme 模式），不要将两套口径混用。

验证建议：CJK、英文、数字与数学公式混合文本；补充平面字符；组合重音；emoji ZWJ；上限边界；说明／引用也纳入完整回复；取消和超时优先于改写。字数合格不代表专业内容合格，两种检查分别保留。

## 本次产出边界

本笔记提供修复设计依据与验收建议，不把尚未执行的测试列为通过。仅新增这一份文档；没有改动前端布局、生产代码、历史验收记录或合作方数据。
