# AI 产出质量审核：来源、纠错与可内置规则

> 本文保留2026-10-10的来源审核与当时验证状态。后续实际模型复测、标题时长校验及最终人工失败结论见[2026-10-11功能与质量验收](feature-quality-validation-2026-10-11.md)和[成长跟进](ai-growth-quality-followup-2026-10-10.md)；下文旧“未完成”不代表后续未进行复测。

核对日期：2026-10-10（北京时间）。本次按用户要求联网核对真实调用保留的成长样本；使用 `research` 的原始来源方法与 `agent-reach` 的 Exa/Jina 路由。Exa 达到免费额度后改用网页工具；Jina 请求超时后读取官方页面。未配置付费搜索，未新增付费模型调用，未修改界面或用户数据。

本文核验事实与推导，并提供 prompt 条款。它不表示所有 AI 回答已审核通过，也不表示 prompt 能保证无幻觉。真实样本在 `artifacts/live-growth-20261010.json`；其中 `manualQualityPassed=false` 与保留的错误仍应如实报告。独立数学复算与来源核对也不能替代学生自己的成果记录。

## 来源及其支持边界

| 编号与原始来源 | 本次核对到的依据 | 不支持的外推 |
| --- | --- | --- |
| R1：[Ben-Ari 与 Mondada，Elements of Robotics，第 16 章 §16.1](https://link.springer.com/chapter/10.1007/978-3-319-62533-1_16) | 作者教材正文以第一杆角 α、第二杆相对转角 β 推导末端投影，第二杆方向使用 α+β；本节可用三角函数逐段计算。正文随后将矩阵变换作为另一种表达。 | 不能由理想二维公式宣称真实机械臂性能、硬件安全、动力学掌握，或所有机器人学习均无需线性代数。 |
| R2：[CMU Robotics for Creative Practice，two-link-kinematics.py](https://courses.ideate.cmu.edu/16-375/f2021/text/code/lecture-samples/two-link-kinematics.html) | 大学课程代码同样将肘角定义为相对上杆，第二杆使用 q0+q1。其零角朝下，表达式为 sin/-cos，说明坐标与零位约定必须先核对。 | 不能把该课程朝下的零位直接套到本产品朝 +x 的算例；同名关节角不必具有相同零位或单位。 |
| R3：[MIT OCW 18.06，Spring 2010 syllabus](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/syllabus/) | 正式课程目标覆盖线性方程、子空间、最小二乘、特征值、变换等；课程每周 3 小时讲座及 1 小时习题课，另有作业和考试；该开课版本列 18.02 为先修。 | 不能把 MIMIR 半小时的自定义基础单元称为完成整门 18.06，也不能将此正式课程的全部先修当作算两个平面三角特例的必需条件。 |
| R4：[MIT OCW 2.12，Fall 2005 syllabus](https://ocw.mit.edu/courses/2-12-introduction-to-robotics-fall-2005/pages/syllabus/) | 正式课程包含运动学、动力学、控制、传感器与实验项目，列 2.003/2.004 背景；每周讲课 3 小时、实验 2 小时。 | 二连杆入门练习不能代表完成 MIT 2.12；无实体设备的纸笔任务不能代表完成其实验。 |
| R5：[Northwestern，Modern Robotics 作者课程页](https://hades.mech.northwestern.edu/index.php/Modern_Robotics) | 整书的先修包括物理、线性代数、微积分、微分方程和基础编程；作者将教学软件与参数限定为学习用途。 | 不支持“机器人都不用线代”，也不支持将教学模拟当作实际装备验证；但整书先修不等于每个局部三角练习的最低先修。 |
| E1：[CMU Eberly Center，assessment alignment](https://www.cmu.edu/teaching/assessment/basics/alignment.html) | 高等教育指导要求目标、练习与评价相互对应，评价要揭示已声明目标的学习情况。 | 原 criteria 没要求一般角或非零首关节角时，不能临时用这些要求否定已正确的两个特例。后续迁移可另列建议。 |
| E2：[CMU Eberly Center，rubrics](https://www.cmu.edu/teaching/designteach/teach/rubrics.html) | 明示、描述性的评价标准有助于一致评分，也用于指出已有长处和改进方向。 | 不能因表述没采用固定模板、或为了凑不足而改变标准；本来源也不证明 AI 自动评分与教师评分等效。 |
| E3：[EEF，Teacher Feedback to Improve Pupil Learning](https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/feedback)；[发布时的三项核心建议](https://educationendowmentfoundation.org.uk/news/eef-publishes-new-guidance-report-teacher-feedback-to-improve-pupil-learning) | 先明确学习目标与差距，再给推动学习的反馈，并安排学生实际使用反馈的机会。 | 指导主要针对 5—18 岁、教师反馈；对本科 AI 教练是谨慎借鉴的设计原则，不能声称已直接验证本产品的效果。 |
| E4：[Deslauriers 等，PNAS 2019 原始研究](https://doi.org/10.1073/pnas.1821936116)；[大学托管的原文 PDF](https://www.williams.edu/teaching-center/files/2023/09/Deslauriers-et-al.-2019.pdf) | 随机分配的大学物理课堂研究中，主观“感觉学到”与实际测得的学习可能分离；原文核对到摘要、方法与研究场景。 | 不能说所有自评都不可信，更不能给每个学生作诊断；可以据此避免将信心评分或完成勾选直接等同于客观掌握。 |

检索曾命中 [Clemson 大学机器人教材](https://opentextbooks.clemson.edu/wangrobotics/chapter/forward-kinematics/)，其索引片段与 R1 公式一致，但正文读取遇到 403。因此不以该片段作为独立完成的正文核验；本文的公式结论依据已读取的 R1，并以 R2 对照角度约定。没有采用二手博客、论坛或搜索摘要作为教学效果证明。

## 数学复算与错误样本纠正

本次采用产品算例约定：基座原点 `(0,0)`、+x 向右、+y 向上、角度逆时针为正；θ₁ 相对 +x，θ₂ 相对第一杆延长方向；`L₁=L₂=1 m`。R1 的 α、β 分别对应 θ₁、θ₂。

```text
第二关节位置 = (L₁ cos θ₁, L₁ sin θ₁)
第二杆全局方向 = θ₁ + θ₂
第二杆位移 = (L₂ cos(θ₁+θ₂), L₂ sin(θ₁+θ₂))
末端位置 = 第二关节位置 + 第二杆位移
```

来源确认公式后，独立使用 JavaScript 的三角函数复算；输入度数先乘 `π/180`，没有调用产品模型或读取产品工具的答案。以下显示舍入值；例如 `cos(90°)` 的浮点残差约 `6.1×10⁻¹⁷`，按零显示，不作为物理误差。

| θ₁、相对 θ₂ | 第二关节 (m) | 第二杆全局角 | 第二杆位移 (m) | 末端 (m) |
| --- | --- | --- | --- | --- |
| 0°、0° | (1,0) | 0° | (1,0) | (2,0) |
| 0°、90° | (1,0) | 90° | (0,1) | (1,1) |
| 30°、90° | (0.866025,0.5) | 120° | (-0.5,0.866025) | (0.366025,1.366025) |
| 30°、60° | (0.866025,0.5) | 90° | (0,1) | (0.866025,1.5) |
| 90°、90° | (0,1) | 180° | (-1,0) | (-1,1) |

对照真实样本发现并纠正两处事实错误：

1. 第一轮反馈对 `(0°,90°)` 称第二杆不朝上，却同时承认全局角为 90°。按本算例坐标约定，第二杆确实竖直向上；“相对角未必等于全局角”在一般情况下成立，但这个特例恰好相等。末端从基座的方位为 45°，也不能与第二杆的 90°方向混为一谈。
2. 重试 `nextStep` 将 `(30°,90°)` 说成 `(0.866,1.5)m`，实际用了 `(30°,60°)` 的答案。正确结果为 `((√3−1)/2,(1+√3)/2)m`。该错误保留在报告中；追加一个新答案必须再次核对其输入与单位，不能把另一组输入的计算结果移用。

## 成果评价与任务安排纠正

合成学生原文给出相对角定义、两组正确特例、单位换算说明和无硬件测试的限制。原 criteria 为“解释 θ₂ 的相对角定义”“正确解出两个特例”“说明一个容易混淆的概念”。按 E1/E2，前两项已有直接支持；“还未做 θ₁≠0 的迁移”可以作为建议，不能新增成原第二项的失败理由。第三项应先检查已有的相对/全局角说明是否满足原标准；若仍缺辨析，只指出实际缺少的内容，不临时要求固定句式、三个新例子或新的测试等级。

已确认一个窄任务不等于全面掌握。自报反思可以帮助找下一步，缺记录只说明尚未确认。模型核对属于反馈对照，不能写成学生实际练习、实物测量或已完成任务。[CMU 评价对齐](https://www.cmu.edu/teaching/assessment/basics/alignment.html)与[原始课堂研究](https://doi.org/10.1073/pnas.1821936116)支持这一谨慎区分；具体状态“不自动完成”和目录 ID 是产品契约，不是由教育研究推导。

R1 的三角推导说明：对“理解相对角、计算零角和直角”这个局部目标，若已会三角函数与投影，可以先做局部练习，无须预设先完成整门 18.06。这是依据目标与公式作出的范围判断，不是外部来源宣称所有人无需补基础。若准备进入完整机器人课程，则按 R4/R5 核对更完整的先修。引用 `courseUnits` 时，以产品实际规范化单元的 objective/criteria 描述安排；不能把已经放入当前 tasks 的基础单元又说成“诊断失败才安排”。

时间复算已完成：`3×20 min = 60 min = 1 h`；`2×20 min = 40 min ≈0.667 h`；若实际安排 2 h、单次不超过 20 min，至少需要 6 个学习时段。预算是上限，无须排满。复盘样本的约 1 h/约 3 h相互矛盾；共享导入样本说每周 2 h，分钟块却只合计 1 h。以规范化 tasks 的逐项 hours 合计为准，明确“任务总工时”与“单次上限”。这些是算术与产品约束核对，不需冒用教育论文支持。前置任务索引与 week 1/2 范围应由服务端校验；自然语言不能将当前前置单元改写成将来的条件备选。

## 可直接内置的短 prompt 条款

以下为本次核验后的设计建议，按职责追加，不改变功能、界面或输出 schema。来源说明留在本文，模型只能引用当前上下文实际带入的来源；不能声称每次回答已联网。

**成果评价 / model.mjs**

```text
逐项以原 criteria 及原顺序判定，先找成果中的直接支持。已正确满足的标准应判 supported；未提供的附件、信心、自报完成不证明掌握。不得以额外算例、固定措辞或全面掌握要求改写原标准。把迁移检查放入 nextStep，不回写为本次未达标理由。反馈写清已有进展、仍缺的证据，以及一个符合时间约束的下一步和验证方法。
```

**数值与工具 / dsh-agent.mjs**

```text
数值判断先核对输入、单位、坐标系、零位和角度定义；θ₂ 为相对角时第二杆全局角为 θ₁+θ₂。调用核对工具时原样保留学生输入与预测，不改成标准答案。工具返回只支持同一组输入，不可移用给新例。未经核对不输出新答案数字；新练习只给输入、要预测的问题与核对方法。理想计算与教学仿真不等于学生练习记录或硬件实测。
```

**计划 / model.mjs**

```text
按目标、已有成果与先修差距选择最小合适单元，区分局部练习和整门课。引用已注册单元时如实使用其实际 objective/criteria，不缩水成一次诊断。总结中的每周与总工时逐项取自规范化 tasks.hours，分钟块与小时合计一致；单次上限用分段处理，无须排满预算。当前任务与条件性未来安排分开，prerequisites 与任务顺序、周次一致。
```

**共同证据边界 / 中英文择一**

```text
区分已提供事实、来源可支持的结论和你的建议；缺材料时明确缺什么。课程目录、资源目录与来源身份不得混用，查询未命中只说明该查询未找到。外部来源未经上下文提供或工具实际检索，不得声称已阅读或已核实。不要承诺成绩、获奖、全面掌握或实物有效。

Separate supplied evidence, source-supported conclusions, and recommendations. Grade the original criteria without adding requirements. Preserve inputs, units, angle conventions, and source identities. Match time claims to normalized task totals. Unverified calculations, self-reports, and simulations are not evidence of mastery or hardware performance. Never claim a source was read or verified unless the current context or tool result supports that claim.
```

## 已完成与未完成

- 已完成：读取上述可访问原始教材/大学/机构正文，核对其适用范围；独立复算 5 组二连杆算例与 3 项时间换算；逐项比对保留样本中的数值、评价标准与安排叙述。
- 已完成：提炼并合并短 prompt 到 `growth/src/model.mjs`、`growth/src/dsh-agent.mjs`；四项新增回归捕获实际 Agent 请求、上下文和工具契约，相关 27 项检查通过。未改前端、真实数据或原错误样本。
- 未完成：最后成长 prompt 的在线模型复验、所有真实论文事实核对、长期教学效果评估。最终整套本地检查确认规则进入请求，仍不能证明在线模型必然正确；此前的人工质量限制保留。
- 工具更新检查已尝试：本地 Agent Reach v1.5.0；GitHub API 额度限制导致无法确认是否有新版，未安装或升级工具。
