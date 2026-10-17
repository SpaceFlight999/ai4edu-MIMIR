# 独立后端与用户闭环回归

本轮只改后端 override、回归测试及验收脚本。未修改前端，未读取用户数据，未调用付费模型。日志、认证状态、截图和合成资料留在 `.test-data/integration`、`.test-data/paper-integration`；公开报告只含安全汇总。

后端保留旧 Core 的版本比较、幂等键、一次授权与提案绑定。新增隔离 `Mimir.exe` 验证：保存/精确重放、相同键不同内容、过期版本、无授权/伪授权、授权绑定与消费、并发旧建议、拒绝无修改、路径名清洗至 UUID 文件、同名文件分别下载、非法文件ID。五组通过。重启前读取最新完整文稿，重启后包含版本、时间戳的对象完全一致。

`scripts/verify-user-loop.mjs` 完整执行九场景。host 17、navigation/UI 10、journey 11、compatibility 6、restart 5、course-loop 12、daily-experience 16、robotics-topic 8 组通过；learning 九组业务验证通过，但原严格390px布局断言失败。实际文档宽390，应用可视宽334、内部滚动宽606；截图显示顶部导航右侧被裁切。此为保留前端的现有边界，未删除断言或修改前端。所有场景无浏览器异常，自有原生主机和浏览器正常停止。总体为8/9，详见 `artifacts/user-loop-20261010.json`。

`scripts/verify-paper-loop.mjs` 将原 `smoke-prompt6.mjs` 复制到隔离目录，取消个人数据哈希读取，并通过仅localhost的模型fixture运行安装版 DSH。普通 `--document-fix` 十组通过、十八次本机fixture请求：PDF导入与授权门槛、导读引用、批注草稿与删除、文稿提案自动接收/审阅、研究发布、失败分类、任务取消/删除、导出、重开及重启。原论文重开 `#text-layer span` 超时在此轮未复现。通过报告保存为 `artifacts/document-smoke.json`。

研究聊天验收已按实际安装版DOM修正：先展开默认折叠的侧栏，再进入研究并创建新会话；仅输入 `[data-composer-input][contenteditable="true"]`，等待原生“发送消息”按钮启用后点击。回复只取新出现且不处于streaming的助手正文 `.hWmORq_root .hWmORq_body`，不检查整页用户输入或会话标题。本机fixture通过相同驱动完成真实UI提交，助手文字与provider模拟回复完全一致，原生主机和浏览器正常退出，见 `artifacts/research-chat-fixture-20261010.json`。真实验收脚本还保留研究comparisons/draft/issues供人工检查，累计失败记录合并去重。

每次真实恢复验收使用新UUID浏览器目录和新wire记录文件，避免旧DevTools端口文件误报；finally保留本轮全部调用元数据。`--remaining --chat-only` 仅恢复聊天，其他模型入口及研究前置块不执行；研究综合未成功时仍显示缺失，不计为整体验收通过。这三项恢复行为另有三项本地回归测试通过，未运行任何付费调用。

最终安装后，组合长材料验收完整通过：17页和42页原生解析PDF，共263292字符、2596条证据；分析、修复、写作、复核请求分别557574、561011、558620、559325字符。十五组业务检查与二十八次本机fixture请求完成，包含低思考强度、重复输出、严格引用修复、不同比较条件的保守结果和全来源导出，主机/浏览器正常退出。前期验收wrapper关闭异常、背景页计时假设已仅在脚本修复，另一次启动前超时保留在私人诊断中；最终独立通过报告见 `artifacts/paper-long-smoke-20261010.json`。

后端提示词明确导读四种kind、JSON对象形状及字段类型；证据不足不凑满八项，数字缺口不能编造原文事实。写作保留ideal、仿真、实物、条件、范围、否定限定，summary/notes只描述patch真实建议。三种政策错误在原生文稿/模型设置和论文传输映射为固定安全中文，禁止暴露原始诊断。单论文研究每个synthesis（含repair）必须comparisons为空，不能拆造paperId；结果schema与严格校验保持。

相关二十二项本地单测通过，包括引用/数值匹配、语义复核一对一、来源隔离、三类政策映射、四kind契约、限定保留与单论文scope；scope提示词已随主线最终安装。fixture和静态提示词验证证明执行路径与契约；本轮真实模型写作质量仍有限，不能据此声明所有生成内容均保持科学语义。
