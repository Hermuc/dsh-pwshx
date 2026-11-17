# 🥊 dsh-pwshx

> **PowerShell 肘击过你几次？**

单引号、双引号、反斜杠、`$` 展开、反引号、换行、中文……
每个 AI agent 都曾在 PowerShell 转义地狱里被肘击到怀疑人生。

更气的是：你明明装了 PowerShell 7，它却在某个角落悄悄掉回 5.1，
然后用一句 `&& 是意外的标记` 把你打回原形。

**`dsh-pwshx` = 一个抗肘击的执行通道 + 一个不让运行时撒谎的门卫。**

**而且现在：官方 `pwsh` 已被隐藏，`pwsh_safe` 是唯一的 PowerShell 执行入口——AI 不用再纠结「用哪个」。**

![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)

## 这是什么

`dsh-pwshx` 把三件本来分开的事装进了一个插件：

1. **`pwsh_safe`（唯一执行入口）**：模型要跑 PowerShell 时，把整段脚本原样交给它——转义、修复、检查、门禁、后台、沙箱升级，它全包。
2. **`pwsh7_status`**：查清 `pwsh_safe` 实际跑的是哪个 PowerShell、哪条路径，以及要改的 profile patch。
3. **`pwsh7_install`**：真没有 PowerShell 7 时，从 Microsoft Store 装一个。

```text
你的脚本（多行、中文、引号随便写）
   ↓
auto-fix（顺手把 ls -la 之类 bash 习惯改成 PowerShell）
   ↓
pscheck（拦下会炸的写法，给出改法）
   ↓
danger-gate（Format-Volume / rm -rf / 之类直接拒绝）
   ↓
base64 编码（纯 ASCII，引号 / $ / 反斜杠全部变安全字符）
   ↓
┌─────────────── 前台 ───────────────┐   ┌──── 后台（run_in_background）────┐
│ ctx.shell（官方沙箱执行器）          │   │ ctx.jobs 注册 → jobId 立即返回     │
│ chcp 65001（UTF-8，中文不乱码）      │   │ job_output 取输出 / job_kill 停止 │
└─────────────────────────────────────┘   └───────────────────────────────────┘
   ↓
结果 + 退出码 + spill 路径 + [auto-fix] 明细 + [fixed script] + [sandbox] 标记
```

## 它治什么病

| 症状 | 只有官方 `pwsh` | 用了 `dsh-pwshx` |
| --- | --- | --- |
| 想输出 `他说:"你好"` | 转义套转义，祈祷能跑 | 原样写，原样跑 |
| 多行脚本 | 每行拼接、层层转义 | 整段直接贴 |
| `$env:PATH -replace ';',';'` | 连环事故 | 没事发生 |
| 中文输出 | 乱码 / 编码错误 | UTF-8 + chcp 65001，稳 |
| 以为在用 PowerShell 7 | 悄悄掉回 5.1，`&&` 直接报错 | gate 拦住，并告诉你怎么修 |
| 不知道实际跑的是哪个版本 | 猜 | `pwsh7_status` 直接报 |
| `npm install` / `cargo build` 跑很久 | 前台干等或超时被杀 | `run_in_background: true` 后台跑 |
| 沙箱拒绝写工作区外 | 只能换路 | `sandbox_permissions` + `justification` 原地申请升级 |

## 三个工具

| 工具 | 干什么 |
| --- | --- |
| `pwsh_safe` | **唯一执行入口**：auto-fix + pscheck + danger-gate + base64 + 前台/后台 + 沙箱升级 |
| `pwsh7_status` | 报告 `pwsh_safe` 的版本、路径，以及要改的 profile patch |
| `pwsh7_install` | 从 Microsoft Store 装 PowerShell 7（需要你确认 VPN 已关闭） |

## 输出字段（与官方 `pwsh` 对齐）

| 字段 | 说明 |
| --- | --- |
| `kind` | `foreground` 或 `background` |
| `cwd` | 本次执行的工作目录 |
| `timeoutMs` | 实际生效的超时 |
| `sandbox` | `{ mode, denied, enforcement?, runnerFailed? }`——沙箱拒绝时 AI 能看到「是权限问题」 |
| `fixedScript` | 被 auto-fix 改写后的脚本全文（截断 4000 字符） |
| `hadErrors` | `exitCode === 0` 但 stderr 有内容——命令报错了但 PowerShell 返回成功 |
| `fixes` / `warnings` / `checks` | auto-fix 明细 / 警告 / 坑位检查结果 |
| `stdout` / `stderr` | 输出（含 `truncated` / `spillPath`） |

## 后台任务

```jsonc
// 长命令（npm install / cargo build / git clone 大仓库）
{
  "script": "npm install",
  "description": "install dependencies",
  "run_in_background": true
}
// → { "kind": "background", "jobId": "pwsh-xxxxxxxx", "cwd": "D:\\project" }
// 之后用 job_output 取输出、job_kill 停止
```

## 沙箱升级

```jsonc
// workspace-write 下写工作区外被拒时，原地申请升级（用户审批）
{
  "script": "Set-Content D:\\Repos\\other\\config.json '...'",
  "description": "write outside workspace",
  "sandbox_permissions": "danger-full-access",
  "justification": "need to update the other repo's config"
}
```

## 它不是魔法

- 它**不修复 PowerShell 语法错误**：引号不配对，它照样报错——只是不会在传输层再坑你一次。
- 它**不自动装 PowerShell 7**：`pwsh7_install` 必须你点头才动。
- 它**隐藏了官方 `pwsh`**：`pwsh_safe` 是唯一执行入口。如果插件加载失败，**没有 `pwsh` 兜底**——这是「零选择」的代价。
- 它**不做超时自动转后台**：长命令请主动传 `run_in_background: true`。

## 模块结构

```text
lib/
├── core/        纯函数：fix / check / encode / herestring / rules / text（无 DSH 依赖，可单测）
│                pscheck 拆为 util / rules-a / rules-b / rules / engine 五个模块
├── dsh/         DSH 适配层：shell / sandbox / render
├── tool/        工具层：pwsh_safe 的 schema / pipeline / register / background
├── runtime/     PowerShell 7 运行时（11 个模块，见 lib/runtime/README.md）
│                util / constants / state / probe / detect / note
│                status / version-guard / install / dispatch / index
├── bridge/      过渡性 UTF-8 console bridge（独立可删）
├── config.js    配置归一化（默认值集中）
└── index.js     入口编排：只做组装，不含业务细节
```

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `fixLevel` | `safe` | `safe` / `full` / `off` |
| `checkMode` | `block` | `block` / `warn` / `off` |
| `shell` | `pwsh` | `auto` / `pwsh` / `powershell51` |
| `timeoutMs` | `120000` | 单次执行超时（毫秒） |
| `maxEncodedChars` | `24000` | base64 编码后的最大字符数 |
| `overridePath` | `""` | 指定 pwsh.exe 路径（优先于自动探测） |
| `utf8Console` | `true` | 是否启用 UTF-8 代码页 bridge |

## `dsh-ops` 式：隐藏官方 `pwsh`

`dsh-pwshx` 支持把官方 `pwsh` 工具隐藏，让 `pwsh_safe` 成为唯一执行入口：

1. **profile `cordis.patch.yml`**：`- id: tool-pwsh` + `disabled: true`（禁 global 层）
2. **`dsh-deep-ptc-mode/lib/preset.json`**：`tool-pwsh` 行 `disabled`（禁 agent 层）
3. **`dsh-deep-ptc-mode/lib/model.mjs`**：`deriveDeepPtc` 的 `terminal` 行加 `disabled: true`（**关键**——`deriveDeepPtc` 会把 `tool-pwsh` 替换成 `terminal`）
4. **`model.mjs:63`**：环境声明改为「Use the pwsh_safe tool for all PowerShell work」

**升级后恢复**：运行 `D:\PortableApps\_fix\Reapply-DeepPtc-Patch.ps1`（`dsh-deep-ptc-mode` 升级会覆盖 2/3/4）。

## 从旧插件迁移

`dsh-pwshx` = `dsh-tool-pwsh-safe-plus` 0.2.13 + `dsh-win-pwsh7` 0.2.11 的合并版。

安装后请从 profile 移除旧的 `dsh-win-pwsh7` 与 `dsh-tool-pwsh-safe-plus`，避免：
- `pwsh7_status` / `pwsh7_install` 工具重名；
- 两个 `tool:pwsh-runtime` 提示段并存。

## 安装

```powershell
dsh plugin --profile web add link:D:/Repos/dsh-pwshx
```

然后在 profile 的 `cordis.patch.yml` 中配置（`config` 整体替换，需写全）：

```yaml
- id: pwshx
  name: dsh-pwshx
  config:
    fixLevel: safe
    checkMode: block
    shell: pwsh
    overridePath: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
```

## License

MIT