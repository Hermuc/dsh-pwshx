# Changelog

## [0.2.1] - 2026-11-16

### Added
- **systemPrompt 段** `tool:pwsh-safe-plus`：告诉模型何时该用 `pwsh_safe`（多行 / 嵌套引号 / 中文 / Bash 惯性），以及 `[auto-fix]` 标记的含义。段名与官方 `tool:pwsh`、dsh-win-pwsh7 的 `tool:pwsh-runtime` 均不冲突。
- **会话工作目录**：优先 `ctx.workingDirectory.ensure(agent, signal)`（与官方 pwsh 同口径），服务缺失时退回 `session.header.cwd`。

### Verified（与 dsh-win-pwsh7 协作）
- `pwsh7_status` / 宿主 `pwsh` / `pwsh_safe` 三者报告同一引擎 7.6.8
- dsh-win-pwsh7 的 UTF-8 console bridge 会给 `pwsh_safe` 的 base64 命令前缀 `chcp.com 65001`，实测 `chcp` 返回 `Active code page: 65001`，中文输出正确
- 工具名与提示段名均无重叠

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
- 68 个 `node --test` 用例：规则正反例、幂等性、safe/full 分级、检查器 77 组自检、危险闸、base64 往返、流水线三路径（执行/阻断/拒绝）、版本过滤、盘根路径回归、提示段注册、工作目录解析
