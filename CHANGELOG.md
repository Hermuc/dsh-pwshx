# Changelog

## [0.2.11] - 2026-11-16

### Fixed（核实 0.2.10 时发现的引号边界）
- **`splitRedirect` 不感知引号**：`ls -la "a > b"` 被拆成 body=`"a` + redirect=` > b"`，生成 `Get-ChildItem "a -Force > b"`（语法错误）。现在扫描时跟踪单/双引号与转义，只在引号外识别重定向。
- **`LS_FLAGS` 先分词再判重定向**：同场景下 `>` 作为 token 被当成重定向起点。改为先 `splitRedirect` 再分词。

### Tests
- 117 个 `node --test` 用例（+2：引号内 `>`、引号内 `2>&1`）

## [0.2.10] - 2026-11-16

### Fixed（核实 0.2.9 修复时发现的边界 bug）
- **`splitCommandHead` 把单个 `&` 当命令分隔符**：`ls -la 2>&1` 被切成 `ls -la 2>` + `&1`，生成 `Get-ChildItem 2> -Force&1`（语法错误）。现在只有 `&&` 才切分，单个 `&` 留给重定向解析（调用运算符也不误切）。
- **重定向被当成路径参数**：`ls -la > out.txt` → `Get-ChildItem > out.txt -Force`；`head -n 3 f.txt 2>&1` → `Get-Content f.txt 2> -TotalCount 3&1`。新增 `splitRedirect()`，`>` / `>>` / `2>` / `2>>` / `*>` / `&>` / `2>&1` 及其后内容统一保留到后缀。
- **`\"` 与反引号转义未处理**：`ls -la "a\"|b"` 被误切分。`splitCommandHead` 现在跳过 `\` 与反引号转义。

### Tests
- 115 个 `node --test` 用例（+5：2>&1 / stdout redirect / && 链 / head 2>&1 / grep 重定向+管道）

## [0.2.9] - 2026-11-16

### Fixed（真实测试发现的管道破坏，覆盖 5 条规则）
- **`GREP` 带管道完全不触发**：`grep -n "test" file | Select-Object` 因为管道后的 `-First` 被当成复杂旗标，整条规则放弃改写，最终 `grep` 命令不存在报错。现在先 `splitCommandHead` 拆分，只解析 grep 段。
- **`HEAD_TAIL` 把 `-TotalCount` 追加到整行末尾**：`head -n 3 file | Select-Object` 变成 `Get-Content file | Select-Object -First 1 -TotalCount 3`，报「找不到参数 TotalCount」。
- **`RM_FLAGS` / `MKDIR_P` / `TOUCH` 同类问题**：`rm -rf build | Out-Null`、`mkdir -p a b | Out-Null`、`touch x | Out-Null` 都会把 flag 追加到管道之后。
- **`splitCommandHead` 管道符前补空格**：修复 `README.md| Select-Object` 粘连。

### Tests
- 110 个 `node --test` 用例（+6 管道回归：GREP / HEAD_TAIL / TAIL / RM_FLAGS / MKDIR_P / TOUCH）

## [0.2.8] - 2026-11-16

### Refactor（模块化，行为零变化）
- **`pscheck.js` 拆分**：`selftest()` 从 **404 行降到 17 行**；385 条自检用例抽到 `lib/core/pscheck-selftest.js`（纯数据，独立维护）。
- **`index.js` 拆分**：`apply()` 从 **136 行降到 5 行**；新增 `lib/tool/` 四模块：
  - `schema.js` —— 工具描述 / 参数 / 输出 schema / 拒绝骨架（纯数据）
  - `session.js` —— 会话 cwd 与 workdir 解析
  - `pipeline.js` —— fix → check → gate → base64 → ctx.shell（73 行，可单测）
  - `register.js` —— systemPrompt 段注册 + 工具注册
- 104 个 `node --test` 用例全过，行为不变。

### Docs
- README 修正两处与实际不符的数字：FIX 规则 **20 → 19** 条（`FIX_RULES.length` 实测），自检 **77 → 385** 组（`SELFTEST_CASES.length` 实测）。

## [0.2.7] - 2026-11-16

### Fixed（真实清理任务中发现的管道破坏）
- **`LS_FLAGS` 把 `-Force` 追加到整行末尾，破坏管道**：`ls -la 'D:\Repos' | Select-Object -First 3` 被改成 `Get-ChildItem 'D:\Repos' -Force | Select-Object -First 3` 之前，实际生成的是 `... | Select-Object -First 3 -Force`，PowerShell 报 `ForEach-Object: 无法绑定参数 'RemainingScripts'`。
  - 新增 `splitCommandHead()`：只处理管道/分号之前的那一段，`tail`（`| ...` / `; ...`）原样保留。
  - 引号内的 `|`/`;`/`&` 不算分隔符。
  - 管道符前补空格，分号不加。

### Tests
- 104 个 `node --test` 用例（+3：管道保留、分号保留、引号内管道不切分）

## [0.2.6] - 2026-11-16

### Fixed（真实清理任务中发现的 R4 误报）
- **R4 把 `$_.Property` / `$PSItem.Property` 当成路径陷阱**：任何在双引号里写 `"--- $($_.Name) ---"` 的脚本都会被 R4 阻断。新增 `AUTO_VARIABLES` 集合（`_` / `PSItem` / `args` / `input` / `this` / `error` / `host` / `PID` 等），自动变量后跟属性访问一律放行。
- **R4 把普通变量的属性访问与路径拼接当成陷阱**：`"$files.Count"`、`"$n\pnpm.log"` 被误阻断。现在只有「全大写环境变量风格」（`$WINDOWS`、`$SYSTEMROOT` 等，且至少 2 字符）后跟 `.` 或 `\` 时才判定为路径陷阱。
- 保留原生用例：`Get-Content "$WINDOWS.~BT.file"`、`"C:\$WINDOWS.~BT\Sources\..."` 仍正确阻断。

### Tests
- 101 个 `node --test` 用例（+5 R4 回归：`$_.Name`、`$PSItem.Name`、`$files.Count`、`$obj.Name`、`$n\pnpm.log`、原生 `$WINDOWS.~BT`）

## [0.2.5] - 2026-11-16

### Docs
- **中文介绍页**：README 按 dsh-tool-pwsh-safe 的介绍风格重写（「肘击」开篇、对比表、特性、安装、使用、配置），并补充本插件独有的自动修复、坑位检查、here-string/注释保护、workdir 校验、与 dsh-win-pwsh7 协作矩阵、7 条上游缺陷修复记录。
- **package.json description 改为中文**：`DeepSeek Harness 的单一 PowerShell 执行路径：执行前自动修复 Bash 惯性语法，再以 base64 编码通过官方 ctx.shell 通道执行（转义免疫，兼容 dsh-win-pwsh7）。`

## [0.2.4] - 2026-11-16

### Fixed（第 3 轮 bug 测试发现）
- **workdir 不存在时报错误导**：executor 拿不存在的目录当 cwd 去 spawn，Windows 报 `spawn C:\Program Files\PowerShell\7\pwsh.exe ENOENT`，看起来像 pwsh 没装。
  - 新增 `assertWorkdir()`：执行前校验目录存在，报 `pwsh_safe workdir does not exist: <path>`。
  - 存在的带空格路径（`C:/Program Files`）不受影响。

### Tests（第 3 轮）
- 93 个 `node --test` 用例（+3 workdir 校验）
- 真实集成矩阵：`pwsh7_status` / 宿主 `pwsh` / `pwsh_safe` 三方版本一致 7.6.8；宿主与 `pwsh_safe` 并发混跑 5 路无串扰；`chcp` 返回 65001（UTF-8 bridge 生效）
- workdir 边界：不存在（明确拒绝）/ `..` / 盘根 `D:/` / 带空格存在路径 / 缺失目录
- 长时运行：20s 任务正常完成（20.5s）
- 大 stderr：64KB、`truncated:true`、spillPath 正确

## [0.2.3] - 2026-11-16

### Fixed（第 2 轮 bug 测试发现）
- **PowerShell 注释被当成粘贴提示符**：两行以上以 `# ` 开头的注释（`# 只有注释`）会被 `STRIP_PROMPT` 的 `#` 投票机制判定为 bash root 提示符并剥离，变成可执行命令（中文注释直接报「术语不被识别为 cmdlet」）。
  - PowerShell 下 `#` 永远不作为提示符；`#` 只在 `shell === "bash"` 时参与单字符提示符判定。
  - `PS C:\...>` 路径提示符仍正常剥离。

### Tests（第 2 轮）
- 90 个 `node --test` 用例（+16：配置归一化、DTO 归一化、沙箱策略解析、注释回归）
- 真实异常路径：2s 超时杀掉 10s 命令（`timedOut:true`）、700 行大脚本、20KB 超限脚本（明确报错）、仅空行（拒绝）、NUL 字符、行首制表符
- 注释修复后实测 5 例：注释脚本、PS 提示符、bash 风格注释、`ls -la` 回归、here-string 回归

## [0.2.2] - 2026-11-16

### Fixed（第 1 轮 bug 测试发现）
- **here-string 被 fix 规则改写**：`$t = @" ... "@` 块内的内容（含行尾反斜杠、`ls`/`export` 等词）会被 `LC_BACKSLASH_TO_BACKTICK`/`LS_FLAGS` 等规则误改，导致终止符 `"@` 无法收尾、脚本语法错误。
  - 新增 `lib/core/herestring.js`：应用规则前把整个 here-string 块替换为占位符，规则跑完再原样恢复；WARN 规则也扫描占位符版本文本，避免 `QUOTE_BALANCE` 误报。
  - 支持双引号 `@"..."@` 与单引号 `@'...'@`，未闭合块原样交给 PowerShell 报错。
  - 修正起始识别：`$var = @"`（@ 前有赋值）也识别；`Write-Output '@'`、`email@domain.com` 不误判。

### Tests（第 1 轮）
- 74 个 `node --test` 用例（+6 here-string 专项）
- 真实执行验证：双引号 here-string、单引号 here-string、外部修复+内部保留、误判回归 4 例全过
- 边界矩阵：13 组规则误伤/边界输入（12 通过，1 失败→已修）；并发 5 路；59KB 长输出 spill；特殊字符矩阵

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