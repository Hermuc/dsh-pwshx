/**
 * R1–R23 自检用例（纯数据，从 pscheck.js 抽出）。
 * 与规则实现分离：新增/调整用例只改这里，不动引擎。
 */
export const SELFTEST_CASES = [
		{
			label: "clean",
			cmd: "Write-Output \"hello\"",
			expect: []
		},
		{
			label: "R2 var-colon",
			cmd: "\"attempt $attempt: downloading...\"",
			expect: ["R2"]
		},
		{
			label: "R2 scope ok",
			cmd: "Write-Output \"$env:Path\"",
			expect: []
		},
		{
			label: "R2 braced ok",
			cmd: "\"attempt ${attempt}: downloading...\"",
			expect: []
		},
		{
			label: "R3 ternary",
			cmd: "$v = ($a -gt 0) ? \"yes\" : \"no\"",
			expect: ["R3"]
		},
		{
			label: "R3 fixed",
			cmd: "$v = if ($a -gt 0) { \"yes\" } else { \"no\" }",
			expect: []
		},
		{
			label: "R4 windows path",
			cmd: "Get-Content \"$WINDOWS.~BT.file\"",
			expect: ["R4"]
		},
		{
			label: "R4 realistic full path",
			cmd: "Get-Content \"C:\\$WINDOWS.~BT\\Sources\\Panther\\setupact.log\"",
			expect: ["R4"]
		},
		{
			label: "R4 single-quoted ok",
			cmd: "Get-Content 'C:\\$WINDOWS.~BT\\Sources\\Panther\\setupact.log'",
			expect: []
		},
		{
			label: "R5 start-process",
			cmd: "Start-Process curl.exe -ArgumentList \"-o a.iso https://x\" -Wait",
			expect: ["R5"]
		},
		{
			label: "R5 direct ok",
			cmd: "& curl.exe -o a.iso https://x",
			expect: []
		},
		{
			label: "R6 array",
			cmd: "Get-WindowsOptionalFeature -Online -FeatureName A, B",
			expect: ["R1", "R6"]
		},
		{
			label: "R6 loop ok",
			cmd: "foreach ($n in \"A\",\"B\") { Get-WindowsOptionalFeature -Online -FeatureName $n }",
			expect: ["R1"]
		},
		{
			label: "R7 dismount",
			cmd: "dism /Mount-Wim ... ; dism /Dismount-Image /MountPath:X",
			expect: ["R7"]
		},
		{
			label: "R7 unmount ok",
			cmd: "dism /Unmount-Image /MountPath:X /Commit",
			expect: []
		},
		{
			label: "R8 restorehealth",
			cmd: "dism /Online /Cleanup-Image /RestoreHealth /Source:WIM:install.wim:1",
			expect: ["R1", "R8"]
		},
		{
			label: "R9 curl resume",
			cmd: "curl -L -C - -o x.iso https://cd.example/x.iso",
			expect: ["R9"]
		},
		{
			label: "R9 plain ok",
			cmd: "curl -o x.iso https://cd.example/x.iso",
			expect: []
		},
		{
			label: "R10 npm bare",
			cmd: "npm run build",
			expect: ["R10"]
		},
		{
			label: "R10 npm.cmd ok",
			cmd: "npm.cmd run build",
			expect: []
		},
		{
			label: "R10 npx bare",
			cmd: "npx hexo version",
			expect: ["R10"]
		},
		{
			label: "R10 pnpm bare",
			cmd: "pnpm run publish",
			expect: ["R10"]
		},
		{
			label: "R10 variable ok",
			cmd: "Write-Output $npmConfig",
			expect: []
		},
		{
			label: "R10 uppercase ok",
			cmd: "NPM.CMD run build",
			expect: []
		},
		{
			label: "R11 and-or",
			cmd: "git commit && git push",
			expect: ["R11"]
		},
		{
			label: "R11 semicolon ok",
			cmd: "git commit; git push",
			expect: []
		},
		{
			label: "R11 cmd-skip ok",
			cmd: "cmd /c copy /b a+b+c out && del a",
			expect: []
		},
		{
			label: "R11 string ok",
			cmd: "Write-Output \"a && b\"",
			expect: []
		},
		{
			label: "R11 pipe ok",
			cmd: "git diff | Select-String x",
			expect: []
		},
		{
			label: "R12 json no depth",
			cmd: "$x | ConvertTo-Json",
			expect: ["R12"]
		},
		{
			label: "R12 json depth ok",
			cmd: "$x | ConvertTo-Json -Depth 10",
			expect: []
		},
		{
			label: "R12 json depth var ok",
			cmd: "$x | ConvertTo-Json -Depth $d",
			expect: []
		},
		{
			label: "R13 foreach underscore",
			cmd: "foreach ($f in $files) { Write-Output $_ }",
			expect: ["R13"]
		},
		{
			label: "R13 foreach var ok",
			cmd: "foreach ($f in $files) { Write-Output $f }",
			expect: []
		},
		{
			label: "R13 forEach-object ok",
			cmd: "$files | ForEach-Object { Write-Output $_ }",
			expect: []
		},
		{
			label: "R14 eq as assign",
			cmd: "if ($x = 5) { break }",
			expect: ["R14"]
		},
		{
			label: "R14 eq comparison ok",
			cmd: "if ($x -eq 5) { break }",
			expect: []
		},
		{
			label: "R14 plain assign ok",
			cmd: "$x = 5",
			expect: []
		},
		{
			label: "R14 while assign",
			cmd: "while ($i = $i + 1) { }",
			expect: ["R14"]
		},
		{
			label: "R15 ps7 ashashtable",
			cmd: "$h = $json | ConvertFrom-Json -AsHashtable",
			expect: ["R15"]
		},
		{
			label: "R15 ps7 parallel",
			cmd: "$files | ForEach-Object -Parallel { $_ }",
			expect: ["R15"]
		},
		{
			label: "R15 ps7 null-coalesce",
			cmd: "$v = $x ?? \"default\"",
			expect: ["R15"]
		},
		{
			label: "R15 ps5 style ok",
			cmd: "$b = Get-Content f -Encoding Byte",
			expect: []
		},
		{
			label: "R16 del cmd-style",
			cmd: "del /f /q file.txt",
			expect: ["R16"]
		},
		{
			label: "R16 env percent",
			cmd: "Write-Output %PATH%",
			expect: ["R16"]
		},
		{
			label: "R16 cmdlet ok",
			cmd: "Remove-Item -Force file.txt",
			expect: []
		},
		{
			label: "R16 cmd context ok",
			cmd: "cmd /c \"copy /b a+b out\"",
			expect: []
		},
		{
			label: "R17 write-host",
			cmd: "Write-Host \"done\"",
			expect: ["R17"]
		},
		{
			label: "R17 write-output ok",
			cmd: "Write-Output \"done\"",
			expect: []
		},
		{
			label: "R1 gbk",
			cmd: "wsl --status",
			expect: ["R1"]
		},
		{
			label: "R1 fixed",
			cmd: "chcp 65001 | Out-Null; wsl --status",
			expect: []
		},
		{
			label: "R18 mojibake marker",
			cmd: "锟斤拷",
			expect: ["R18"]
		},
		{
			label: "R18 mojibake from gbk misread",
			cmd: "'涓€閿瀯寤哄苟閮ㄧ讲鍗氬鍒?chaggle'",
			expect: ["R18"]
		},
		{
			label: "R18 ufffd",
			cmd: "Write-Output \"�\"",
			expect: ["R18"]
		},
		{
			label: "R18 clean chinese ok",
			cmd: "Write-Output \"构建成功\"",
			expect: []
		},
		{
			label: "R19 remove-item object",
			cmd: "if ($items) { Remove-Item -Recurse -Force $items }",
			expect: ["R19"]
		},
		{
			label: "R19 remove-item var",
			cmd: "Remove-Item -Recurse -Force $objs",
			expect: ["R19"]
		},
		{
			label: "R19 fullname ok",
			cmd: "Remove-Item -Recurse -Force -Path $items.FullName",
			expect: []
		},
		{
			label: "R19 pipe ok",
			cmd: "Get-ChildItem $target -Force | Remove-Item -Recurse -Force",
			expect: []
		},
		{
			label: "R19 literalpath ok",
			cmd: "Remove-Item -LiteralPath $p -Recurse -Force",
			expect: []
		},
		{
			label: "R10 quoted label ok",
			cmd: "Write-Output '--- npm audit summary ---'",
			expect: []
		},
		{
			label: "R10 commit message ok",
			cmd: "git commit -m 'chore: pnpm upgrade to 12.14.0'",
			expect: []
		},
		{
			label: "R10 double-quoted ok",
			cmd: "Write-Output \"npm install notes\"",
			expect: []
		},
		{
			label: "R10 after semicolon",
			cmd: "git status; npm run build",
			expect: ["R10"]
		},
		{
			label: "R5 quoted mention ok",
			cmd: "git log --grep 'Start-Process'",
			expect: []
		},
		{
			label: "R17 quoted mention ok",
			cmd: "git commit -m 'fix Write-Host usage'",
			expect: []
		},
		{
			label: "R20 irm non-ascii body",
			cmd: "$comment = '中文说明'; Invoke-RestMethod -Uri $u -Method POST -Body $body",
			expect: ["R20"]
		},
		{
			label: "R20 utf8 bytes ok",
			cmd: "Invoke-RestMethod -Uri $u -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($json))",
			expect: []
		},
		{
			label: "R20 ascii body ok",
			cmd: "Invoke-RestMethod -Uri $u -Method POST -Body $body",
			expect: []
		},
		{
			label: "R21 lockfile json",
			cmd: "$lock = Get-Content 'package-lock.json' -Raw | ConvertFrom-Json",
			expect: ["R21"]
		},
		{
			label: "R21 node parse ok",
			cmd: "node tool.mjs package-lock.json",
			expect: []
		},
		{
			label: "R22 credential pipe",
			cmd: "@('protocol=https','host=github.com','') | git credential fill",
			expect: ["R22"]
		},
		{
			label: "R22 cmd redirect ok",
			cmd: "cmd /c \"git credential fill < in.txt > out.txt\"",
			expect: []
		},
		{
			label: "R22 normal pipe ok",
			cmd: "git log | Select-String fix",
			expect: []
		},
		{
			label: "R23 native 2>&1",
			cmd: "git push origin master 2>&1 | Select-String master",
			expect: ["R23"]
		},
		{
			label: "R23 drop stderr ok",
			cmd: "git push origin master 2>$null",
			expect: []
		},
		{
			label: "R23 cmdlet 2>&1 ok",
			cmd: "Get-ChildItem x 2>&1 | Out-String",
			expect: []
		}
];
