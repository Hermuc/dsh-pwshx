/**
 * pscheck-rules.js —— 规则清单（顺序即执行顺序）。
 */

import { r1Gbk, r2VarColon, r3Ternary, r4DollarInDoubleQuotedPath, r5StartProcess, r6FeatureNameArray, r7DismountImage, r8RestoreHealthSource, r9CurlResume, r10NpmCmd, r11NoAndOr, r12JsonDepth } from "./pscheck-rules-a.js";
import { r13UnderscoreInForeach, r14AssignmentAsComparison, r15Ps7OnlySyntax, r16CmdStyle, r17WriteHost, r18Ps1Encoding, r19RemoveItemObject, r20HttpBodyEncoding, r21ConvertFromJsonLockfile, r22NativeStdinPipe, r23NativeStderrMerge } from "./pscheck-rules-b.js";

/** Pitfall rules: R1/R12/R13/R15/R16/R17/R18/R19/R21/R22/R23 advisory, the rest blocking. */
export const RULES = [
	{
		id: "R1",
		severity: "advisory",
		title: "中文输出可能 GBK 乱码",
		titleEn: "Possible GBK mojibake for Chinese console output",
		blog: "§2-3",
		test: r1Gbk,
		fix: "命令涉及 wsl/Windows 功能查询且未见 chcp：输出中文前先 `chcp 65001 | Out-Null`（或设置 [Console]::OutputEncoding）。",
		fixEn: "Commands touching wsl/Windows feature queries without chcp: prefix `chcp 65001 | Out-Null` (or set [Console]::OutputEncoding) before reading Chinese output."
	},
	{
		id: "R2",
		severity: "blocking",
		title: "$var: 被解析成驱动器限定变量",
		titleEn: "$var: parsed as a drive-qualified variable",
		blog: "§1-1",
		test: r2VarColon,
		fix: "`$attempt:` 会被当成 `$env:Path` 式作用域语法，改为 `${attempt}:` 显式界定。",
		fixEn: "`$attempt:` is parsed as scope/drive syntax (like $env:Path); use `${attempt}:` to delimit explicitly."
	},
	{
		id: "R3",
		severity: "blocking",
		title: "PowerShell 5.1 没有三元运算符",
		titleEn: "PowerShell 5.1 has no ternary operator",
		blog: "§1-2",
		test: r3Ternary,
		fix: "`($a -gt 0) ? \"yes\" : \"no\"` 在 PS 5.1 解析报错；改用 `$v = if ($a -gt 0) { \"yes\" } else { \"no\" }`。",
		fixEn: "`($a -gt 0) ? \"yes\" : \"no\"` is a parse error in PS 5.1; use `$v = if ($a -gt 0) { \"yes\" } else { \"no\" }`."
	},
	{
		id: "R4",
		severity: "blocking",
		title: "双引号里的 $变量 被展开（路径陷阱）",
		titleEn: "Double-quoted $var expanded (path trap)",
		blog: "§2-1",
		test: r4DollarInDoubleQuotedPath,
		fix: "双引号内 $WORD 后跟 . 或 \\ 时路径中的 $ 会被展开（如 \"C:\\$WINDOWS.~BT\\Sources\\...\"）；需要字面 $ 的路径改用单引号。确属展开意图可忽略。",
		fixEn: "Inside double quotes a $WORD followed by . or \\ is expanded (e.g. \"C:\\$WINDOWS.~BT\\Sources\\...\"); use single quotes when the $ must stay literal. Ignore when expansion is intended."
	},
	{
		id: "R5",
		severity: "blocking",
		title: "Start-Process 包装外部命令",
		titleEn: "Start-Process wrapping an external command",
		blog: "§3-1",
		test: r5StartProcess,
		fix: "-ArgumentList 不会自动加引号（路径含空格碎参数）；后台 Start-Process curl 下载会内容损坏。能直接调用就别包一层：`& curl.exe ...`。",
		fixEn: "-ArgumentList does not quote automatically (paths with spaces break); background Start-Process curl downloads came out corrupted. Call `& curl.exe ...` directly instead of wrapping."
	},
	{
		id: "R6",
		severity: "blocking",
		title: "Get-WindowsOptionalFeature 的 FeatureName 不支持数组",
		titleEn: "Get-WindowsOptionalFeature -FeatureName does not take arrays",
		blog: "§4-1",
		test: r6FeatureNameArray,
		fix: "`-FeatureName A, B` 报 Cannot convert System.Object[]；用 `foreach ($n in \"A\",\"B\") { ... -FeatureName $n }`。",
		fixEn: "`-FeatureName A, B` fails with Cannot convert System.Object[]; loop: `foreach ($n in \"A\",\"B\") { ... -FeatureName $n }`."
	},
	{
		id: "R7",
		severity: "blocking",
		title: "DISM 动词 /Dismount-Image 不存在",
		titleEn: "DISM verb /Dismount-Image does not exist",
		blog: "§4-2",
		test: r7DismountImage,
		fix: "正确动词是 `/Unmount-Image`，否则报 错误:87 且 wim 一直挂载占空间。",
		fixEn: "The correct verb is `/Unmount-Image`; /Dismount-Image errors (错误:87) and leaves the wim mounted."
	},
	{
		id: "R8",
		severity: "blocking",
		title: "RestoreHealth 源版本可能比系统新",
		titleEn: "RestoreHealth source may be newer than the current build",
		blog: "§4-3",
		test: r8RestoreHealthSource,
		fix: "0x800f0915 = 修复源比当前系统新；源要求同版本或更旧，或走 Windows Update。",
		fixEn: "0x800f0915 means the fix source is newer than the current system; use a source of the same or older build, or Windows Update."
	},
	{
		id: "R9",
		severity: "blocking",
		title: "curl -L 与 -C - 组合可能拖慢 CDN 下载",
		titleEn: "curl -L with -C - can slow CDN downloads",
		blog: "§3-4",
		test: r9CurlResume,
		fix: "部分 CDN 上 `curl -L` 与 `-C -` 组合会拖慢速度；优先 HEAD 拿 Content-Length → 分段 `-r` 并行 → copy /b 合并。",
		fixEn: "On some CDNs `curl -L` combined with `-C -` is slow; prefer HEAD for Content-Length, parallel `-r` ranges, then copy /b merge."
	},
	{
		id: "R10",
		severity: "blocking",
		title: "npm/npx/pnpm 不带 .cmd 后缀（npm.ps1 被 ExecutionPolicy 拦截）",
		titleEn: "npm/npx/pnpm invoked without the .cmd suffix (npm.ps1 blocked by ExecutionPolicy)",
		blog: "§3-2",
		test: r10NpmCmd,
		fix: "PowerShell 默认禁止运行脚本，PATH 里的 npm.ps1 加载报错（running scripts is disabled）；显式用 `npm.cmd run ...` / `npx.cmd ...` / `pnpm.cmd ...`。",
		fixEn: "PowerShell blocks script execution, so the npm.ps1 on PATH fails (running scripts is disabled); explicitly use `npm.cmd run ...` / `npx.cmd ...` / `pnpm.cmd ...`."
	},
	{
		id: "R11",
		severity: "blocking",
		title: "PowerShell 5.1 没有 && / || 链式运算符",
		titleEn: "PowerShell 5.1 has no && / || chain operators",
		blog: "§1-3",
		test: r11NoAndOr,
		fix: "`a && b` 在 PS 5.1 解析报错（PS 7+ 才支持）；改用 `a; b`、`if ($LASTEXITCODE -eq 0) { b }` 或分行执行。cmd/bash 内部除外。",
		fixEn: "`a && b` is a parse error in PS 5.1 (PS 7+ only); use `a; b`, `if ($LASTEXITCODE -eq 0) { b }`, or separate lines. cmd/bash contexts are exempt."
	},
	{
		id: "R12",
		severity: "advisory",
		title: "ConvertTo-Json 未指定 -Depth（默认 2 截断嵌套数据）",
		titleEn: "ConvertTo-Json without -Depth (default depth 2 truncates nested data)",
		blog: "§5-1",
		test: r12JsonDepth,
		fix: "AI 生成的 JSON 序列化常被静默截断：默认深度只有 2 层。显式加 `-Depth 100`（或按数据实际深度设值）。",
		fixEn: "AI-generated JSON serialization is silently truncated: the default depth is only 2. Add `-Depth 100` (or a value matching your data)."
	},
	{
		id: "R13",
		severity: "advisory",
		title: "foreach 循环体内使用 $_（不是循环变量）",
		titleEn: "$_ used inside a foreach ($x in ...) loop (not the loop variable)",
		blog: "§5-2",
		test: r13UnderscoreInForeach,
		fix: "在 `foreach ($f in $files)` 里循环变量是 `$f`，`$_` 是外层管道的当前对象或 $null；改用循环变量，或换 `ForEach-Object { $_ }`。",
		fixEn: "Inside `foreach ($f in $files)` the loop variable is `$f`; `$_` is the enclosing pipeline item or $null. Use the loop variable, or switch to `ForEach-Object { $_ }`."
	},
	{
		id: "R14",
		severity: "blocking",
		title: "if/while 条件里用单等号 = 当比较",
		titleEn: "Single = used as a comparison inside if/while conditions",
		blog: "§1-4",
		test: r14AssignmentAsComparison,
		fix: "`if ($x = 5)` 是赋值不是比较（条件恒真）——AI 常把 `=` 当 `==`；PS 比较用 `-eq`：`if ($x -eq 5)`。",
		fixEn: "`if ($x = 5)` assigns instead of comparing (always truthy) — AI often uses `=` like `==`; PowerShell comparisons use `-eq`: `if ($x -eq 5)`."
	},
	{
		id: "R15",
		severity: "advisory",
		title: "PowerShell 7+ 专属语法（5.1 不兼容）",
		titleEn: "PowerShell 7+ only syntax (not compatible with 5.1)",
		blog: "§1-5",
		test: r15Ps7OnlySyntax,
		fix: "`-AsHashtable`、`ForEach-Object -Parallel`、`-AsByteStream`、`??`、`?.` 都是 PS 7+ 才有；目标机若是 5.1 会直接报错。确认运行环境或改用 5.1 等价写法（如 `-Encoding Byte`）。",
		fixEn: "`-AsHashtable`, `ForEach-Object -Parallel`, `-AsByteStream`, `??`, `?.` are PS 7+ only; on a 5.1 host they fail outright. Confirm the runtime or use the 5.1 equivalent (e.g. `-Encoding Byte`)."
	},
	{
		id: "R16",
		severity: "advisory",
		title: "cmd 风格命令/环境变量混入（del/copy/move/mkdir、%VAR%）",
		titleEn: "cmd-style commands or %VAR% env syntax mixed into PowerShell",
		blog: "§3-3",
		test: r16CmdStyle,
		fix: "裸 `del`/`copy`/`move`/`mkdir` 是 cmd 风格（参数语义与 PowerShell cmdlet 不同），`%VAR%` 在 PS 中不会展开；改用 `Remove-Item`/`Copy-Item`/`Move-Item`/`New-Item` 与 `$env:VAR`。",
		fixEn: "Bare `del`/`copy`/`move`/`mkdir` are cmd-style (flag semantics differ from PS cmdlets) and `%VAR%` does not expand in PowerShell; use `Remove-Item`/`Copy-Item`/`Move-Item`/`New-Item` and `$env:VAR`."
	},
	{
		id: "R17",
		severity: "advisory",
		title: "Write-Host 输出不进管道（AI 常用来「打印」结果）",
		titleEn: "Write-Host output bypasses the pipeline (AI often prints results with it)",
		blog: "§2-4",
		test: r17WriteHost,
		fix: "`Write-Host` 只写控制台，下游 `|` 捕获不到；需要输出/捕获结果用 `Write-Output`（或直接表达式）。进度提示才用 Write-Host。",
		fixEn: "`Write-Host` writes only to the console; downstream `|` cannot capture it. Use `Write-Output` (or a bare expression) when the result must be captured; Write-Host is only for progress display."
	},
	{
		id: "R18",
		severity: "advisory",
		title: ".ps1 文件中文乱码：UTF-8 无 BOM（PS 5.1 按 ANSI 解析）",
		titleEn: "Garbled Chinese in .ps1: UTF-8 without BOM (PS 5.1 decodes as ANSI)",
		blog: "§2-5",
		test: r18Ps1Encoding,
		fix: "Windows PowerShell 5.1 对无 BOM 的 UTF-8 .ps1 按 ANSI(GBK) 解析：中文变乱码、引号可能失衡导致 ParserError。含中文的 .ps1 必须保存为 UTF-8 with BOM（或用 `Get-Content -Encoding UTF8` 读取检查）。",
		fixEn: "Windows PowerShell 5.1 reads a BOM-less UTF-8 .ps1 as ANSI(GBK): Chinese literals turn to mojibake and quotes can unbalance into a ParserError. Save .ps1 files with Chinese as UTF-8 with BOM (or read/check them with `-Encoding UTF8`)."
	},
	{
		id: "R19",
		severity: "advisory",
		title: "Remove-Item 传文件系统对象按当前目录解析",
		titleEn: "Remove-Item resolves FileSystemInfo objects against the current directory",
		blog: "§5-3",
		test: r19RemoveItemObject,
		fix: "PS 5.1 把位置参数传入的文件系统对象经 ToString() 转成 -Path：DirectoryInfo 只返回目录名，会相对当前目录解析 → `Cannot find path`。用 `-Path $items.FullName` 传完整路径，或改用管道 `| Remove-Item`。",
		fixEn: "PS 5.1 converts positional FileSystemInfo arguments to -Path via ToString(); a DirectoryInfo yields only its bare name, resolved against the CWD → `Cannot find path`. Pass `-Path $items.FullName`, or pipe the items into Remove-Item."
	},
	{
		id: "R20",
		severity: "blocking",
		title: "Invoke-RestMethod 用字符串 -Body 发非 ASCII 会变成问号",
		titleEn: "Invoke-RestMethod string -Body mangles non-ASCII on PS 5.1",
		blog: "§6-1",
		test: r20HttpBodyEncoding,
		fix: "PS 5.1 按默认代码页把字符串 body 编成字节：中文到服务端变成 ?，是静默数据损坏。改发 UTF-8 字节：`-Body ([System.Text.Encoding]::UTF8.GetBytes($json))`，并把 -ContentType 设为 application/json; charset=utf-8。",
		fixEn: "PS 5.1 encodes a string body with the default code page, so Chinese reaches the server as ? (silent corruption). Send UTF-8 bytes: `-Body ([System.Text.Encoding]::UTF8.GetBytes($json))`, with -ContentType set to application/json; charset=utf-8."
	},
	{
		id: "R21",
		severity: "advisory",
		title: "ConvertFrom-Json 遇到空键名会报 name 无效（package-lock.json 必踩）",
		titleEn: "ConvertFrom-Json fails on empty property names (package-lock.json)",
		blog: "§6-2",
		test: r21ConvertFromJsonLockfile,
		fix: "PS 5.1 的 ConvertFrom-Json 无法把空属性名（package-lock.json v3 的 packages[\"\"] 根条目）转成对象，抛 Cannot process argument because the value of argument name is not valid；仅大小写不同的重复键则是另一条 duplicated keys 报错。这类文件改用 node 解析，或升级到 PS 7 用 -AsHashtable（见 R15）。",
		fixEn: "PS 5.1 ConvertFrom-Json cannot turn an EMPTY property name into an object (package-lock.json v3 has one: the \"\" root entry) and throws \"Cannot process argument because the value of argument name is not valid\"; duplicate keys differing only by case fail with a separate duplicated-keys error. Parse such files with node, or move to PS 7 with -AsHashtable (see R15)."
	},
	{
		id: "R22",
		severity: "advisory",
		title: "管道喂原生程序 stdin 会丢空行（git credential 等）",
		titleEn: "Piping into a native stdin protocol loses blank lines (git credential)",
		blog: "§6-3",
		test: r22NativeStdinPipe,
		fix: "PS 5.1 把集合逐项喂给原生命令时，空行与二进制内容不可靠：git credential fill 会报 \"refusing to work with credential missing protocol field\"。改用文件重定向：`cmd /c \"git credential fill < in.txt > out.txt\"`。",
		fixEn: "PS 5.1 feeds collections to native commands item by item, so blank lines and binary content are unreliable: git credential fill fails with \"refusing to work with credential missing protocol field\". Redirect a file instead: `cmd /c \"git credential fill < in.txt > out.txt\"`."
	},
	{
		id: "R23",
		severity: "advisory",
		title: "原生命令的 2>&1 会把 stderr 变成 ErrorRecord",
		titleEn: "2>&1 on a native command turns stderr into ErrorRecords",
		blog: "§6-4",
		test: r23NativeStderrMerge,
		fix: "PS 5.1 里 `git ... 2>&1` 会把每行 stderr 包成 ErrorRecord（输出出现 \"git : ... NativeCommandError\"），配合 ErrorActionPreference=Stop 还会直接终止。只看 stdout 用 `2>$null`；要合并则先把 ErrorActionPreference 设为 Continue，再 `| ForEach-Object { \"$_\" }` 转成字符串。",
		fixEn: "On PS 5.1 `git ... 2>&1` wraps every stderr line in an ErrorRecord (output shows \"git : ... NativeCommandError\"), and under ErrorActionPreference=Stop it terminates outright. Use `2>$null` when only stdout matters; to merge, set ErrorActionPreference=Continue and stringify with `| ForEach-Object { \"$_\" }`."
	}
];
