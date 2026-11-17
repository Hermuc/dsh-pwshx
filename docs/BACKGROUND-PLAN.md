# 后台任务（run_in_background）设计方案

> 目标：让 `pwsh_safe` 支持 `run_in_background`，与 `job_output` / `job_kill` 集成。
> 约束：模块化、可移植性、易维护性；不牺牲现有功能。

## 一、背景：为什么需要

`pwsh_safe` 当前用 `ctx.shell.execute` + `handle.result()`，默认 `timeoutMs: 120000`。
超过 120 秒的命令（`npm install` / `cargo build` / `git clone` 大仓库）会被杀，且不能后台运行。

官方 `dsh-tool-pwsh` 有 `run_in_background` + `ctx.jobs` 集成 + 30 秒自动提升。
`pwsh_safe` 要补齐这个能力。

## 二、三个方案对比

| 方案 | 做法 | 优点 | 缺点 | 判定 |
|---|---|---|---|---|
| **A. 直接 import 官方内部模块** | import 官方 `lib/background.js` | 零重复 | 依赖内部路径（`exports` 不暴露）；DSH 升级会断 | ❌ 否决 |
| **B. 复制官方适配层到本插件** | `lib/tool/background.js`（~140 行） | 零外部依赖；行为与官方对齐 | 重复 ~140 行，需随上游同步 | ✅ **采纳** |
| **C. 自写简化版** | 只用 `job.handle` + `proc.done` | 代码最少 | 取消/失败/输出 pump 的 edge case 容易漏 | ❌ 否决 |

## 三、方案 B 的实施设计

### 3.1 新增 `lib/tool/background.js`（~140 行）

从官方 `@deepseek-ai/dsh-tool-pwsh/src/background.ts` 裁剪，保留行为、去掉 sandbox escalation 依赖：

- `processJob(start, outcome)` — start(signal) -> Promise<ShellProcess>；返回 {cancel, done, failure}
- `processSources(proc)` — () => ShellProcess -> JobOutputSource[]
- `processOutcome(proc)` — ShellProcess -> JobOutcome（status/detail）
- `ringDelta(chunks)` — JobChunk[] -> delta 文本

### 3.2 `lib/dsh/shell.js` 拆分

当前 `runViaShell` 一步完成「resolve → execute → result」。拆成：

- `buildShellSpec(ctx, request, exec)` — 纯 spec 构建（含 sandboxPolicy/dshEnv/workdir）
- `runViaShell(ctx, request, exec)` — 前台：buildShellSpec + execute + result

后台分支复用 `buildShellSpec`，避免两套 spec 逻辑。

### 3.3 `lib/tool/pipeline.js` 加分支

在 base64 之后、workdir 之后判断 `args.run_in_background === true`：

- `registry = ctx.get?.('jobs') ?? ctx.jobs`；缺失时**明确报错**
- `registry.start({ kind: 'pwsh', label: args.description, toolCall, owner, output: processSources(...), run: () => processJob(...) })`
- 返回 `{ kind: 'background', jobId, cwd: workdir }`

### 3.4 `lib/tool/schema.js`

- 参数加 `run_in_background`（boolean，可选）
- `OUTPUT_SCHEMA` 改 `oneOf`：前台（现有结构）+ 后台（`{ kind: 'background', jobId, cwd }`）

### 3.5 `lib/dsh/render.js`

- `kind === 'background'` → `started background job <jobId>`

### 3.6 测试

- `test/background.test.js`：processJob / processSources / processOutcome / ringDelta
- `test/pipeline.test.js` 加 `run_in_background` 分支（stub `ctx.jobs`）

## 四、风险与反思

| 风险 | 说明 | 缓解 |
|---|---|---|
| `ctx.jobs` 不可用 | 宿主没装 jobs 服务 | `ctx.get('jobs')` 检查，缺失时明确报错（不静默降级） |
| `owner` 类型 | `exec.agent.id` 是 SessionId | 与官方一致 |
| `processOutcome` 的 sandbox notes | 官方依赖 dsh-sandbox marker | 简化：只报 `sandbox.denied` 文本 |
| 前台/后台 schema 冲突 | `additionalProperties: false` | 用 `oneOf`；前台不带 kind，后台带 kind |
| 与官方 job kind 冲突 | 官方用 `kind: 'pwsh'` | 先用 `'pwsh'`，避免 JobKindMap 类型声明 |

## 五、不做的事

- **不做 30 秒自动提升**（`promoteOnTimeout`）——需要后台就直接传 `run_in_background: true`。
- **不做 `sandbox_permissions` 升级**——独立需求，本次只补后台任务。
---

## 执行结果（2026-11-17 完成）

**采纳方案 B（复制官方适配层，零外部依赖）。**

| 文件 | 改动 |
|---|---|
| `lib/tool/background.js` | **新增 102 行**：`processJob` / `processSources` / `processOutcome` / `ringDelta` |
| `lib/dsh/shell.js` | 拆出 `buildShellSpec(ctx, request, exec)`，`runViaShell` 复用它 |
| `lib/tool/pipeline.js` | 在 base64 与 workdir 之后加 `run_in_background` 分支 |
| `lib/tool/schema.js` | 新增 `run_in_background` 参数；`OUTPUT_SCHEMA` 改为 `oneOf`（前台 + 后台） |
| `lib/dsh/render.js` | `kind === 'background'` → `started background job <jobId>` |
| `test/background.test.js` | **新增 9 个测试** |

**验证**：

- `node --test`：**176 / 176 通过**
- 集成（stub `ctx.jobs` + 真实 pwsh）：
  - `execute` 返回 `{"kind":"background","jobId":"pwsh-test-1","cwd":"D:\\PortableApps"}`
  - `job.kind = 'pwsh'`、`label` 正确、`owner` 正确、2 个 output source
  - **stdout ring**：`{"text":"bg-done\r\n","nextOffset":9,"lossy":false}`
  - **job outcome**：`{"status":"completed","detail":"exit code: 0"}`
- 真实 profile：`dsh --profile web --dump-config` 中有 `jobs`（`@deepseek-ai/dsh-jobs-local`）与 `tool-jobs`（`@deepseek-ai/dsh-tool-jobs`）

**未做**：30 秒自动提升、`sandbox_permissions` 升级（见「不做的事」）。