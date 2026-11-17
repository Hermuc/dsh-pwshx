# 🥊 dsh-pwshx

> **PowerShell 肘击过你几次？**

单引号、双引号、反斜杠、`$` 展开、反引号、换行、中文……
每个 AI agent 都曾在 PowerShell 转义地狱里被肘击到怀疑人生。

更气的是：你明明装了 PowerShell 7，它却在某个角落悄悄掉回 5.1，
然后用一句 `&& 是意外的标记` 把你打回原形。

**`dsh-pwshx` = 一个抗肘击的执行通道 + 一个不让运行时撒谎的门卫。**

![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)

## 这是什么

`dsh-pwshx` 把两件本来分开的事装进了一个插件：

1. **`pwsh_safe`**：模型要跑 PowerShell 时，把整段脚本原样交给它——转义问题它来扛。
2. **`pwsh7_status` / `pwsh7_install`**：查清当前 `pwsh` 到底跑的是哪个版本；真没有 PowerShell 7 时，从 Microsoft Store 装一个。

```text
你的脚本（多行、中文、引号随便写）
   ↓
auto-fix（顺手把 ls -la 之类 bash 习惯改成 PowerShell）
   ↓
pscheck（拦下会炸的写法，给出改法）
   ↓
base64 编码（纯 ASCII，引号 / $ / 反斜杠全部变安全字符）
   ↓
ctx.shell（和内置 pwsh 同一条沙箱执行器）
   ↓
chcp 65001（UTF-8 代码页，中文不乱码）
   ↓
结果 + 退出码 + spill 路径 + [auto-fix] 明细
```

## 它治什么病

| 症状 | 只有内置 pwsh | 用了 dsh-pwshx |
| --- | --- | --- |
| 想输出 `他说:"你好"` | 转义套转义，祈祷能跑 | 原样写，原样跑 |
| 多行脚本 | 每行拼接、层层转义 | 整段直接贴 |
| `$env:PATH -replace ';',';'` | 连环事故 | 没事发生 |
| 中文输出 | 乱码 / 编码错误 | UTF-8 + chcp 65001，稳 |
| 以为在用 PowerShell 7 | 悄悄掉回 5.1，`&&` 直接报错 | gate 拦住，并告诉你怎么修 |
| 不知道 `pwsh` 是哪个版本 | 猜 | `pwsh7_status` 直接报 |

## 三个工具

| 工具 | 干什么 |
| --- | --- |
| `pwsh_safe` | 跑脚本：auto-fix + pscheck + base64 + 沙箱执行 |
| `pwsh7_status` | 报告当前 `pwsh` 的版本、路径，以及要改的 profile patch |
| `pwsh7_install` | 从 Microsoft Store 装 PowerShell 7（需要你确认 VPN 已关闭） |

## 它不是魔法

- 它**不修复 PowerShell 语法错误**：引号不配对，它照样报错——只是不会在传输层再坑你一次。
- 它**不自动装 PowerShell 7**：`pwsh7_install` 必须你点头才动。
- 它**不替代** `pwsh`：`pwsh` 仍在，只是 gate 会确保它不偷偷降到 5.1。

## 模块结构

```text
lib/
├── core/        纯函数：fix / check / encode / herestring / rules / text（无 DSH 依赖，可单测）
│                pscheck 拆为 util / rules-a / rules-b / rules / engine 五个模块
├── dsh/         DSH 适配层：ctx.shell / 结果渲染
├── tool/        工具层：pwsh_safe 的 schema / pipeline / register
├── runtime/     PowerShell 7 运行时（11 个模块，见 lib/runtime/README.md）
│                util / constants / state / probe / detect / note
│                status / gate / install / dispatch / index
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

## 从旧插件迁移

`dsh-pwshx` 0.1.0 = `dsh-tool-pwsh-safe-plus` 0.2.13 + `dsh-win-pwsh7` 0.2.11 的合并版。

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
