# 🥊 dsh-tool-pwsh-safe-plus

> **dsh 肘击 PowerShell 有两次：一次转义，一次语法。这个插件一次挡两次。**

单引号、双引号、反斜杠、`$` 展开、多行脚本、中文乱码……
再加上 `ls -la`、`export A=1`、`/dev/null`、CRLF 污染、粘贴的提示符……
每个 AI agent 都在 PowerShell 上被肘击过。

![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)

## 这是什么

`dsh-tool-pwsh-safe-plus` 是 [dsh-tool-pwsh-safe](https://github.com/sryimnoob123/dsh-tool-pwsh-safe) 的增强版：
在「base64 转义免疫」之外，多了一层**执行前的语法自动修复**，并且继续走 DSH 官方的 `ctx.shell` 通道。

一条统一的执行路径，一次工具调用：

```text
你的脚本（多行随便写，bash 习惯也随便写）
   ↓
① 自动修复    ls -la → Get-ChildItem -Force
              export A=1 → $env:A='1'
              /dev/null → $null
              CRLF → LF、粘贴提示符剥离、bash 续行 → 反引号
   ↓
② 坑位检查    R1–R23 静态规则；阻断级直接拒绝并给出修复建议
   ↓
③ 危险闸      格式化卷 / 清盘 / 根目录递归删除 / setx → 拒绝执行
   ↓
④ base64      纯 ASCII，引号 / $ / 反斜杠 / 换行 / 中文全部变安全字符
   ↓
⑤ ctx.shell   与内置 pwsh 同一执行器，沙箱策略照常生效，兼容 dsh-win-pwsh7
   ↓
结果：修复摘要 + 警告 + 坑位建议 + 沙箱标记 + spill 路径 + 退出码
```

## 对比：肘击 vs 不肘击

| 场景 | 内置 pwsh 的日常 | pwsh_safe |
| --- | --- | --- |
| 想输出 `他说:"你好"` | 转义套转义，祈祷能跑 | 原样写，原样跑 |
| 多行脚本 | 每行拼接、层层转义 | 整段直接贴 |
| `$env:PATH -replace ';',';'` | 连环事故 | 没事发生 |
| 中文输出 | 乱码/编码错误 | UTF-8 全链路，稳 |
| `ls -la` | 别名不认 bash 旗标，报错浪费一轮 | 自动改成 `Get-ChildItem -Force` |
| `export A=1` | 不是 PowerShell 语法 | 自动改成 `$env:A='1'` |
| `cat x \| grep y` | grep 不存在 | 检查阶段提示改用 `Select-String` |
| here-string `@" ... "@` | 内容被规则误改 | 整块保护，逐字保留 |
| 两行以上 `# 注释` | 被当成粘贴提示符剥掉 | 正确识别为注释 |

## 特性

- **双保险**：自动修复 20 条 + 警告 5 条（来自 powershell-fix，MIT）+ 23 条坑位检查（来自 @chaggle/dsh-powershell-check，MIT，含 77 组自检）
- **走 DSH 沙箱通道**：和内置 `pwsh` 工具同一执行器，沙箱策略 / ConstrainedLanguage / 权限升级全部生效
- **与 dsh-win-pwsh7 无冲突**：同一 `ctx.shell`、UTF-8 bridge 的 `chcp 65001` 实测生效、提示段名独立
- **结果透明**：每次调用回传 `fixes` / `warnings` / `checks`，模型能看见自己被改了什么
- **长输出自动 spill**：超限不丢，完整输出落盘并报告路径
- **超时保护**：默认 120s，可自定义
- **脚本长度守卫**：base64 后超 24000 字符直接报错提示拆分
- **workdir 校验**：目录不存在时明确报错，不误导成 pwsh 没装
- **零依赖**：无 @deepseek-ai 依赖，纯 Node 内置

## 安装

```powershell
# 1) 卸掉旧的 pwsh-safe（如果装了）
dsh plugin --profile web remove dsh-tool-pwsh-safe

# 2) 本地 link 安装
dsh plugin --profile web add link:D:/Repos/dsh-tool-pwsh-safe-plus

# 3) 确认 profile 的 package.json：dependencies 出现 link:...，bundles 出现 dsh-tool-pwsh-safe-plus
# 4) 重启 dsh web（插件模块不热重载，patch 文件才热重载）
```

## 使用

```json
{
  "script": "ls -la; Write-Host \"这是中文 + 引号 + $env:USERNAME\"",
  "description": "演示修复 + 转义免疫"
}
```

结果里会看到：

```text
[auto-fix] LS_FLAGS: converted 'ls -flags' to Get-ChildItem (PS alias exists but bash flags are invalid)
...命令输出...
```

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖：

```yaml
- insert:
    - id: tool-pwsh-safe-plus
      name: 'dsh-tool-pwsh-safe-plus'
      config:
        fixLevel: safe        # safe | full | off
        checkMode: block      # block | warn | off
        shell: pwsh           # auto | pwsh | powershell51
        timeoutMs: 120000
        maxEncodedChars: 24000
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `fixLevel` | `safe` | `safe` 只跑高置信度等价改写；`full` 额外启用 `rm/sed/chmod` 等语义改写；`off` 关闭修复 |
| `checkMode` | `block` | 阻断级坑位（R2/R3/R5/R10/R11/R14/R20 等）直接拒绝执行；`warn` 只提示；`off` 不检查 |
| `shell` | `pwsh` | **不做子进程探测**（探测会阻塞且可能误判 5.1）；环境真是 5.1 时显式设 `powershell51` |
| `timeoutMs` | 120000 | 执行超时 |
| `maxEncodedChars` | 24000 | base64 后长度上限（Windows argv 32767 的安全余量） |

## 与 dsh-win-pwsh7 的协作（实测）

两者是互补关系，不是竞争关系：

| 维度 | 行为 | 证据 |
| --- | --- | --- |
| 执行通道 | 都走 `ctx.shell`（同一个 pwsh executor） | `pwsh` 与 `pwsh_safe` 报告的版本都是 7.6.8 |
| UTF-8 代码页 | pwsh7 的 bridge 会给 `pwsh_safe` 的 base64 命令前缀 `chcp.com 65001 > $null;` | `pwsh_safe("chcp")` → `Active code page: 65001` |
| 中文输出 | 前缀不影响 base64 调用串，中文逐字正确 | 实测 `中文：你好，世界` |
| 工具名 | `pwsh`（宿主）/ `pwsh_safe`（本插件）/ `pwsh7_status` / `pwsh7_install`，无重叠 | 全部可同时调用 |
| 提示段名 | `tool:pwsh` / `tool:pwsh-runtime` / `tool:pwsh-safe-plus`，无重叠 | 注册时互不覆盖 |

> 注意：pwsh7 的 bridge 是**直接改写 `ctx.shell.execute` 的 spec.command**。本插件不检查 `spec.command` 的最终形态，因此前缀不会造成误判；如果将来要做「命令回显」，必须意识到它已经带了 `chcp` 前缀。

## 相对上游修掉的几个真实缺陷

1. **`ctx.shell.run` API 误用**：上游两个插件都调这个不存在的 API，必然 `ctx.shell.run is not a function`；本插件改用官方 seam 的 `resolve()` + `execute()` + `result()`。
2. **移除 `spawnSync("pwsh")` 版本探测**：阻塞事件循环，且误判成 5.1 会把合法的 `&&` 拆掉。
3. **盘根路径被误当续行**：`Remove-Item -Recurse C:\`、`Get-ChildItem D:\` 的行尾反斜杠曾被改写；现在要求「有下一行 + 非盘符根 + 非 UNC 尾」。
4. **`&&` 在 pwsh 7 下被误阻断**：R3/R11 只在 PowerShell 5.1 成立，现按 `shell` 过滤。
5. **here-string 被规则改写**：`@" ... "@` 块整块保护，规则不进入。
6. **PowerShell 注释被当成粘贴提示符**：`# 注释` 不再参与提示符判定。
7. **workdir 不存在时报错误导**：不再报 `spawn ... pwsh.exe ENOENT`，改为 `workdir does not exist: <path>`。

## 测试

```powershell
node --test
```

**93 个用例**：规则正反例、幂等性、safe/full 分级、上游 77 组自检、危险闸、base64 往返（中文/引号/多行）、流水线三路径（执行/阻断/拒绝）、版本过滤、盘根路径、here-string、注释、workdir、配置归一化、DTO 归一化。

## License

MIT。见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)（三个上游项目的归属）。
