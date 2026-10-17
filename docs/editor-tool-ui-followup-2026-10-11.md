# 文稿与工具界面实际补验

2026-10-11，使用已安装的 MIMIR 0.12.8 原生宿主和 Edge，在新建 UUID 合成 home 内完成实际界面操作。独立脚本为 `scripts/verify-editor-tool-ui.mjs`；最终证据为 [editor-tool-ui-followup-20261011.json](../artifacts/editor-tool-ui-followup-20261011.json)，4/4 项通过。所有编辑、按钮点击和下载均由真实浏览器输入触发，接口记录用于核对这些操作的结果。

文稿中输入合成标记，再点击工具栏“撤销”和“重做”：撤销后正文与输入前逐字一致，重做后与输入后的正文逐字一致；点击“保存”后显示“文稿已保存”。随后追加另一段合成内容，在界面仍显示“文稿未保存”时点击“导出 Markdown”，实际下载的 179 字节文件同时包含最新追加内容和重做恢复的内容。实际点击“导出 LaTeX”下载的 301 字节文件也包含最新内容及完整文档包装。报告保留两份下载文件的 SHA-256。

工具界面“本地运行”执行自造 Python 脚本：输出开始标记，等待 12 秒，写出 `ui-tool-result.txt`，再输出完成标记。第一次点击“运行脚本”后按钮禁用，等待期间对同一按钮位置再次进行真实指针点击；全过程只记录到 1 个 `runtime.run` 请求，HTTP 200、进程退出码 0、没有超时，返回实际生成文件 `analysis.py` 和 `ui-tool-result.txt`。完成标记在界面可见，按钮恢复可点击。Windows 输出的 CRLF 保留在报告中，断言仅将换行形式统一后逐字核对两行预期输出。

运行等待期间检查可见工具控件，没有“取消”或“停止”按钮。`toolCancellation.status` 因此记录为 `unavailable`，`actualUICancellationVerified` 为 `false`。后端存在请求信号取消路径，但本次没有用后台中止请求替代界面验收，也没有将取消功能记为通过。

本次没有模型生成请求，付费模型调用为 0，没有读取密钥或个人 home。原生宿主与 Edge 均通过正常关闭路径退出；浏览器异常为 0。截图和生成材料仅保存在该次合成 home 内，公开 JSON 仅包含合成文本、请求路径、状态和文件元数据。

前几次验收脚本适配记录全部保留：`editor-tool-ui-first-20261011.json`、`editor-tool-ui-navigation-20261011.json`、`editor-tool-ui-targeting-20261011.json`、`editor-tool-ui-line-endings-20261011.json` 和 `editor-tool-ui-readiness-20261011.json`。这些记录涉及 Markdown 对连字符的正常转义、界面切换动画中的按钮命中等待及 Windows 换行形式。最终脚本等待按钮实际可点击后发送真实输入，仍要求精确正文回滚/恢复、最新导出内容和只执行一次。本轮仅新增自己的验收脚本、证据与说明，没有改动或安装生产代码。

复测使用 `node scripts/verify-editor-tool-ui.mjs --report artifacts/editor-tool-ui-<新的名称>.json`。脚本拒绝覆盖已有报告，每次建立新的合成 home。该结果覆盖本机上述界面功能；工具界面取消仍不可用。
