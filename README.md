# dsh-tool-pwsh-safe-plus

> **一条执行路径，同时挡掉两类 PowerShell 事故：**
> **① Bash 惯性 / 粘贴污染（语法错误） ② 引号 / `$` / 反斜杠 / 中文（转义事故）。**

DSH（DeepSeek Harness）插件。模型写 PowerShell 时经常踩两类坑，分开治会互相打架：

| 方案 | 转义免疫 | 语法修复 | 与 `dsh-win-pwsh7` 协同 |
|---|---|---|---|
| `dsh-tool-pwsh-safe` | ✅ base64 | ❌ | ✅ 走 `ctx.shell` |
| `powershell-fix` | ❌ 明文 | ✅ `fix()` | ✅ 走 `ctx.shell`（但调错 API，见下） |
| **本插件** | ✅ base64 | ✅ 先修后编 | ✅ 走 `ctx.shell` |

## 为什么需要它（上游的真实 bug）

`dsh-tool-pwsh-safe@0.1.1` 与 `powershell-fix@0.1.0` 都写了：

```js
const result = await ctx.shell.run(ctx.shell.resolve(request));
```

但 DSH 0.2.x 的 `@deepseek-ai/dsh-shell` 只暴露：

```js
const spec = ctx.shell.resolve(request);
const result = await (await ctx.shell.execute(spec)).result();
```

**`ctx.shell.run` 不存在**，所以这两个插件在本机都会抛 `ctx.shell.run is not a function`。
本插件用正确的 seam，并且只复用它们的**纯函数**部分（规则表 / 检查器），不依赖它们的工具层。

## 安装

```powershell
# 1) 卸掉旧的 pwsh-safe（如果装了）
dsh plugin --profile web remove dsh-tool-pwsh-safe

# 2) 本地 link 安装
dsh plugin --profile web add link:D:/Repos/dsh-tool-pwsh-safe-plus

# 3) 确认 profile 的 package.json：dependencies 出现 link:...，bundles 出现 dsh-tool-pwsh-safe-plus
# 4) 重启 dsh web（插件模块不热重载，patch 文件才热重载）
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
|---|---|---|
| `fixLevel` | `safe` | `safe` 只跑高置信度等价改写；`full` 额外启用 `rm/sed/chmod` 等语义改写；`off` 关闭修复 |
| `checkMode` | `block` | 阻断级坑位（R2/R3/R5/R10/R11/R14/R20 等）直接拒绝执行；`warn` 只提示；`off` 不检查 |
| `shell` | `pwsh` | **不做子进程探测**（探测会阻塞且可能误判 5.1）；环境真是 5.1 时显式设 `powershell51` |
| `timeoutMs` | 120000 | 执行超时 |
| `maxEncodedChars` | 24000 | base64 后长度上限（Windows argv 32767 的安全余量） |

## 执行流水线

```
明文脚本
 ├─① fix()     20 条 FIX 规则（CRLF/提示符/续行/ls/export/dev-null/head/grep/mkdir/touch/which…）
 ├─② check()   23 条 R 规则（阻断级 → 拒绝执行并给修复建议）
 ├─③ gate()    危险命令闸（格式化卷/清盘/根目录递归删除/setx…）
 ├─④ base64    纯 ASCII，转义物理免疫 + 长度守卫
 └─⑤ ctx.shell.resolve → execute → result()   （与内置 pwsh 同一执行器 → 继承 dsh-win-pwsh7 路由）
```

## 规则来源

| 层 | 来源 | 数量 |
|---|---|---|
| FIX / WARN | [powershell-fix](https://github.com/GuTianshuo/powershell-fix) `lib/rules.js` | 20 + 5 |
| CHECK | [@chaggle/dsh-powershell-check](https://github.com/chaggle/dsh-powershell-check) `lib/checker.js` | 23（含 77 组自检） |
| 执行模板 | [dsh-tool-pwsh-safe](https://github.com/sryimnoob123/dsh-tool-pwsh-safe) | base64 调用式 |

全部 MIT，归属见 [NOTICE](./NOTICE)。

## 已知限制

1. **管道里的 bash 命令不自动修**：`cat app.log | grep error` 不会被改写（`GREP` 规则只匹配行首），只会在 check 阶段提示。
2. **不修复引号不闭合**：按设计只 `warnings` 提示并原样执行（base64 让转义不再是问题）。
3. **不探测 PowerShell 版本**：默认按 pwsh 7 处理；若目标机是 5.1，请设 `shell: powershell51`（否则 `&&` 不会被拆）。
4. **不实现常驻进程**：每次调用都是新 pwsh 进程，无状态。

## 架构

```
lib/
├── index.js        # 插件入口：注册工具 + 流水线编排（唯一有 IO 的文件）
├── config.js       # 配置默认值与归一化
├── core/           # 纯函数，零 DSH 依赖，可独立单测
│   ├── fixer.js    # fix() 编排 + safe 分级
│   ├── rules.js    # 20 FIX + 5 WARN
│   ├── pscheck.js  # 23 R 规则 + check/formatHits
│   ├── gate.js     # 危险命令闸
│   └── encode.js   # base64 + 长度守卫
└── dsh/            # DSH 适配层
    ├── shell.js    # ctx.shell resolve/execute/result 归一化
    └── render.js   # 渲染修复摘要 + 输出
```

**加规则只改 `core/rules.js` 或 `core/pscheck.js`，不碰流水线。**

## 测试

```powershell
node --test          # 50 个用例，含 77 组上游自检
```

覆盖：规则正反例、幂等性、safe/full 分级、检查器自检、危险命令闸、base64 往返（中文/引号/多行）、流水线三条路径（执行/阻断/拒绝）。

## License

MIT。见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
## 相对上游修掉的两个真实缺陷

1. **盘根路径被误当续行**：`Remove-Item -Recurse C:\`、`Get-ChildItem D:\` 的行尾 `\` 曾被 `LC_BACKSLASH_TO_BACKTICK` 改写成反引号，导致命令语义变化。现在要求「确实有下一行 + 非盘符根 + 非 UNC 尾」才转换。
2. **`&&` 被误阻断**：`R11`（PowerShell 5.1 不支持 `&&`）在 pwsh 7 上不成立，但原版检查器一刀切阻断。现在 `lib/core/checkgate.js` 按 `shell` 过滤 R3/R11。

这两条都有回归用例（`test/rules.test.js`、`test/checkgate.test.js`、`test/pipeline.test.js`）。
