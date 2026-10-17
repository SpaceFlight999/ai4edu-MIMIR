# 写作动作与改动说明复核

2026-10-10；依据本轮实际官方模型样本 `artifacts/live-native-selected-final-20261010.json`，全文读取后分别判断。

重新联网读取 [Purdue OWL 主动与被动语态](https://owl.purdue.edu/owl/general_writing/academic_writing/active_and_passive_voice/active_versus_passive_voice.html)。原站用主语、动作与执行者关系解释语态。由此采用本项目的编辑规则：语言润色须保留动作本身，执行者未给就保持未知；讨论某模型不能改成执行该模型或把它设为前提。这是对编辑范围的归纳，不是原站对本模型的认证。

本轮 Word 建议将 `ideal simulation` 改为 `idealized simulation`，仍保留 `One`、`was discussed` 和 `No hardware tests were performed`。notes 对术语未定义及研究范围保留疑问，并说明没有导入 Word 文件、没有文件修订。本合成样本内容通过；术语若在其他正文另有定义，需沿原定义复核。

Markdown 虽保留标题和无硬件测试的限定，却将 `An ideal simulation was discussed` 改成 `The simulation was treated as ideal`：讨论模型与将模型按理想条件处理是不同动作。notes 也承认方向可能不符，却已把新含义写入 patch；另把实际第一句误称为第二句。因此本样本人工内容不通过，不能因 JSON 或否定保留就称高质量。

后端提示现增加动作、未知执行者、时态、数量保护；含义不清时保留原句并提出具体澄清，notes 用原句与建议句定位，不凑改动。不新增字段、不改前端，也不自动采用建议。相关实际提示构造检查通过，仍需安装后的真实复测；原失败样本保留。

## 2026-10-11 安装后四入口实际复测

原始记录为 `artifacts/live-native-writing-final-20261011.json`，四次官方原生请求均返回规范模型；仅使用隔离合成材料，原文稿未改变，测试凭据已清除。完整阅读记录为 `artifacts/live-native-writing-final-quality-review-20261011.json`，人工接受 3/4，整体内容质量未全过。

段落建议只增加连接词，保留示例范围和未开展硬件测试的限制；LaTeX 仅将 `with two inputs` 改为 `using two inputs`，命令、数量和动作保留，二者通过。

Word 将 `One ideal simulation was discussed` 改为 `An idealized simulation was discussed`，单数、讨论动作与无硬件测试的否定保留。`One` 的强调减弱为 `An`，notes 的“完成态”语法标签不够准确，记录为轻微问题；没有新增实验或声称改文件。原验收脚本把“未改写为已执行”当成肯定执行，已修正否定识别；离线派生报告 `artifacts/live-native-writing-final-derived-20261011.json` 仅更正该判定，没有新付费请求，也没有覆盖原始记录。

Markdown 返回 `We discussed an ideal simulation. We performed no hardware tests.`，原文没有提供执行者。notes 要求事后确认 We，仍不能支持正文中已经新增的身份，人工不通过。后端增加限定范围的事实动作检查：Word/Markdown 正文新增第一人称过去动作且原文、要求均未提供身份时，在候选返回前拒绝；不自动改文、不偷偷重试。该检查仅补充拦截已发现的模式，不能代替完整语义审核。原文已有身份或用户明确要求使用第一人称的合法编辑继续保留。

## 窄拦截复核与两入口后续样本

独立检查最初发现 `Don't ever use We` 否定绕过、中文“我”译为“I”的误拦，以及I/We互换漏拦，见 `writing-guard-independent-review-20261011.json`。修正按当前指令分句识别否定，并分开保留单数/复数身份；8个独立案例复核全部符合预期，见 `writing-guard-independent-recheck-20261011.json`。新回归同时保留已有我们→We、明确正向身份要求、原文选区、修订及无变化边界。

安装后只重测受影响的Word/Markdown，新增两次官方请求，见 `live-native-writing-guard-followup-20261011.json`。全文审核 `live-native-writing-guard-quality-review-20261011.json` 接受二者的正文建议：Word仅ideal→idealized，保留One/讨论/硬件测试否定，并对术语定义提出确认；Markdown保持原文，后端正确去掉未变化patch并返回无变化说明。Word notes仍有英文过去时标签不精确与“仅讨论、未执行”范围表达容易歧义的问题，单列轻微观察；不能由原文讨论某仿真推断该仿真从未执行。

新样本未触发执行者拦截，不能作为所有未来新增执行者都会被捕获的证明。历史We错误通过实际后端回归夹具验证拒绝；旧人工失败记录仍为false。段落/LaTeX未受这次后端改变影响，本轮不重复付费。
