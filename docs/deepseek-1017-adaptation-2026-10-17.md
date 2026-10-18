# DeepSeek 1017 模型接口与界面适配

2026-10-17，工作区及增长层版本保持 0.12.10。变更已构建并同步至本目录 runtime，已有后台需正常退出并重新启动才能载入。

## 官方接口依据

- [10 月 17 日更新日志](https://api-docs.deepseek.com/zh-cn/updates/)：DeepSeek-V4.1-Flash-1017 继续使用 `deepseek-flash` 调用；1017 是展示版本，不能追加到请求模型 ID。
- [模型能力接口](https://api-docs.deepseek.com/api/list-models/)：Flash 支持文本/图片，Pro 为文本；上下文 1,048,576 tokens，最大输出 393,216 tokens。
- [思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)：关闭思考或 low/high/max；三种协议的参数位置不同，不能通用透传同一个字段。
- [Anthropic 兼容协议](https://api-docs.deepseek.com/guides/anthropic_api/) 与 [Responses 协议](https://api-docs.deepseek.com/guides/responses_api/)：保留各自请求、流式响应和历史重放规则。

以上是本次核对日期的官方资料快照。此改动是现有原生适配器的兼容补丁，未整体升级 Harness 引擎，也未新增独立 Search/Fetch API 功能。

## 接口检查与修正

| 范围 | 结果 |
| --- | --- |
| DeepSeek 官方适配器 | 更新默认 Flash/Pro 展示版本及容量；保留实际请求 ID。只更新缺省输出预算，已有提供商和自定义模型预算保持优先级。 |
| 三种自定义协议 | 分别验证 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 的实际本机请求和流式答案；补充协议地址提示，避免重复拼接 `/v1/messages`。 |
| 模型能力与选择 | 使用原生 exact model 元数据，展示真实可用强度、上下文、默认输出上限和图片能力；保存前验证强度。普通模型不生成推理档位。 |
| 默认模型与会话模型 | 全局设置明确标注“默认模型”；研究输入框恢复原生会话 directory/select、锁定和子会话限制，显示当前会话实际模型。 |
| 论文与多论文研究 | 取消静默覆盖用户强度的 off/low 行为；简洁输出仍由提示词和单次 token 预算控制。达到预算时保留已有完整性错误处理。 |
| 切换后的回复约束 | 原生 model-selection 通知不再被误当成用户问题，字数与已给数值约束继续生效；一次修正仍使用该次请求的提供商、模型及强度。 |
| 凭据 | 继续使用原生本机凭据服务；目录只暴露 configured/writable 状态，能力响应不回传连接对象或密钥。刷新时清空待填 Key，防止跨提供商误保存。 |
| 论文阅读器 | 沿用独立服务的 token 路径、Host/Origin/X-Paper-Guide 校验，复用相同模型保存逻辑。跨端口父子页只向已知窗口和来源同步；独立打开也可保存推理强度。 |

第三方目录、地址、协议和已有个人配置未强制迁移。按用户最终澄清：当前模型名称旁用蓝色 `1017` 胶囊；设置页和所有模型下拉列表使用普通 `1017` 文字，不用蓝色胶囊。未确认版本的模型不添加版本号或额外 API 标记。适用于研究输入框、全局模型设置、成长层共用控件和论文阅读器，兼容深浅色、键盘操作和窄屏。

## 验证证据

- 最终完整回归：334/334 通过，包含原生 DeepSeek 四档序列化、思考/工具历史及预算保留、三协议本机模拟收发，以及后续文稿标题修改。见 `artifacts/combined-final-unit-20261017.json`。
- 模型界面最终证据见 `artifacts/model-1017-delivery-ui-20261017-r2.json`。覆盖自定义提供商创建/保存、普通文字与蓝色 1017 的使用位置、强度、深浅色、窄屏、跨面板 Key 清空、已有会话绑定、切换后的回复修正、论文页同步、独立阅读器保存和来源校验。测试使用真实已安装宿主、独立合成目录和本机模拟服务，未调用付费模型。
- 安装覆盖文件逐项大小及 SHA-256 的最终核对见 `artifacts/combined-install-verification-20261017.json`。旧 `verify-overlay.mjs` 依赖历史原始运行库计数 64078，而已有报告为 64077，前置断言未通过；未改写旧报告，此次另行逐项核验当前覆盖清单。
- 测试应用及浏览器均已退出，未读取或写入个人数据。截图：`artifacts/model-api-settings-light-20261017.png`、`model-api-settings-dark-20261017.png`、`model-api-settings-mobile-20261017.png`、`model-api-reader-20261017.png`。

未逐一连接所有外部提供商做付费实测；本机模拟验证不能代替服务端可用性、账户权限或新模型回答质量验证。没有改写个人数据库、个人运行中会话或原始发布包。
