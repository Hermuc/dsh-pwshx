# Changelog

## [0.2.0] - 2026-11-16

首个版本。基于三个上游项目的纯函数部分重组。

### Added
- `pwsh_safe` 工具：明文 → `fix()` → `check()` → `gate()` → base64 → `ctx.shell` 的单一路径
- 20 条 FIX 规则 + 5 条 WARN 规则（移植 powershell-fix，MIT）
- 23 条 R1–R23 静态检查（移植 @chaggle/dsh-powershell-check，MIT，含 77 组自检）
- 危险命令闸（移植 powershell-fix `gate.js`）
- `fixLevel` / `checkMode` / `shell` / `timeoutMs` / `maxEncodedChars` 五项配置
- 结果始终回传 `fixes` / `warnings` / `checks`，模型可见改写内容
- 会话级沙箱策略解析（`resolveSandboxPolicy`），与官方 `dsh-tool-pwsh` 同一口径

### Fixed（相对上游）
- **`ctx.shell.run` API 误用**：改为官方 seam 的 `resolve()` + `execute()` + `result()`
- **移除 `spawnSync("pwsh")` 版本探测**：阻塞事件循环，且误判成 5.1 会把合法 `&&` 拆掉
- **`LC_BACKSLASH_TO_BACKTICK` 盘根误判**：`Remove-Item -Recurse C:\` / `Get-ChildItem D:\` 的行尾反斜杠曾被当成 bash 续行改写；现在要求「有下一行 + 非盘符根 + 非 UNC 尾」
- **R3/R11 在 pwsh 7 下误阻断**：三元与 `&&` 在 PowerShell 7 合法，现按 `shell` 过滤（新增 `lib/core/checkgate.js`）
- **base64 长度守卫改在 fix 之后计算**（修复会改变脚本长度）
- **沙箱策略默认值陷阱**：不显式传 `sandboxPolicy` 时 executor 退回部署默认（workspace-write），与当前会话的 danger-full-access 不一致；现在按会话解析后传入

### Tests
- 62 个 `node --test` 用例：规则正反例、幂等性、safe/full 分级、检查器 77 组自检、危险闸、base64 往返、流水线三路径（执行/阻断/拒绝）、版本过滤、盘根路径回归
