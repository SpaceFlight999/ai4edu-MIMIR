# Windows 启动凭据锁释放修复

日期：2026-10-10。交付版本：0.12.8。

## 故障与调用链

隔离合成 home 的真实 native 启动在模型请求前失败：required 插件 `connection` 未激活，原因是删除 `.credentials.yaml.lock` 返回 `EBUSY`。启动日志保存在工程外的 `_inventory/live-native-remaining-0.12.8.log`；它不是模型响应失败。

`dsh-client-connection` 启动时通过 `BrowserAuth.create` 初始化持久化浏览器会话签名 secret，调用 `credentials.modifyRecord(client-connection/browser-session)`。`dsh-credentials-local` 在 `withFileLock` 内重读并原子写入凭据文档。`@deepseek-ai/dsh-atomic-write@0.1.7-rc.2` 的 `withFileLock` 原实现获取锁使用独占 `wx`，但 `finally` 释放仅执行一次 `rm(lockPath, { force: true })`。短暂文件占用导致释放抛错，因而必需的浏览器连接服务启动失败。

原生 atomic-write 已对 Windows rename 做重试；锁释放没有同类处理。本补丁只修复持有者释放，不改变凭据格式、来源优先级、API Key、浏览器认证规则或前端。

## 最小覆盖补丁

源文件：`growth/overrides/atomic-write/index.js`。安装目标：`runtime/system/engine/node_modules/@deepseek-ai/dsh-atomic-write/lib/index.js`。

上游原文件 SHA256：`5f07978ef594a2711b2da301d5cb73a835cf1a48c1f8920ab5c6625137e12029`。保留上游 MIT 包身份。覆盖文件仅增加 `releaseFileLock`，并用它替换 `withFileLock` 的最终单次删除。

- 只在 Windows 且错误为 `EBUSY` 或 `EPERM` 时重试。
- 最多 8 次重试，即初次在内最多 9 次删除；等待依次为 20、40、80、160、200、200、200、200 毫秒，总等待上限 1.1 秒，不包含操作系统调用耗时。
- `EACCES`、`EIO` 等其他错误立即向调用者返回。重试耗尽仍返回失败，不把未释放的锁当作成功。
- 重试只删除当前锁路径，不重复运行被保护的读、改、写操作；锁成功删除前竞争写入仍须等待。
- 保留原有独占创建、获取超时、PID 存活判断、退出持有者接管、原子 rename、mode 和异常传播。未改 temp 清理或旧锁接管规则。

## 故障注入结果

`growth/test/atomic-write-lock-release.test.mjs` 使用 `.test-data` 下随机临时目录、合成凭据文档和实际文件系统 API。仅对指定临时锁的删除注入错误，不触碰用户数据、真实凭据或模型。

同一短暂 `EBUSY` 用例在还原且 SHA256 完全匹配的上游实现失败；补丁下 **10 项通过、0 项失败、0 项跳过**。报告：`artifacts/atomic-lock-release-20261010.json`。

覆盖短暂 `EBUSY`/`EPERM` 后释放成功、文档完整且操作只执行一次、等待重试期间竞争者不进入、两类持续错误均在有限次数后失败并保留锁、无关错误不重试且活持有者仍受获取超时保护、原操作错误在成功释放后保留，以及非 Windows 原有立即失败行为。源码语法检查通过。

```powershell
node --test growth/test/atomic-write-lock-release.test.mjs
```

故障注入证明错误处理和锁协议边界，不能等同于必然复现某一种杀毒软件的实际占用。主任务已安装覆盖并完成真实 native 启动、本机 Agent 与长论文流程；完整 191 项回归通过。实际启动结果另见 `artifacts/live-native-20261010.json`；该报告区分在线功能结果与人工内容质量。本故障注入子任务未读取真实凭据或发起在线模型请求。
