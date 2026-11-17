# dsh-ops 式切换方案（隐藏官方 pwsh 工具）

> 目标：让 AI 只看到一个「执行 PowerShell」的工具（`pwsh_safe`），消除 `pwsh` vs `pwsh_safe` 的选择成本。
> 约束：模块化、可移植性、易维护性；不牺牲功能。

## 一、现状

| 层 | 现状 |
|---|---|
| 工具层 | `pwsh`（官方）+ `pwsh_safe` + `pwsh7_status` + `pwsh7_install` = 4 个工具 |
| 执行器层 | `dsh-pwsh-sandbox` 的 `SandboxPwshExecutor`（未改） |
| 官方 `pwsh` 的注册 | **两层**：`dsh-base/cordis.patch.yml`（global）+ `dsh-deep-ptc-mode/lib/preset.json`（agent） |

## 二、三版方案对比

| 方案 | 做法 | 工作量 | 优点 | 缺点 | 判定 |
|---|---|---|---|---|---|
| **A. 最小改动** | 只禁 `tool-pwsh`，不补沙箱升级 | 1 小时 | 快 | **丢失 `sandbox_permissions`**（真实能力） | ❌ 否决 |
| **B. 一步到位** | 补 `sandbox_permissions` + 禁 `tool-pwsh` + 改文案 | 1-2 天 | 一次完成 | 改动集中，风险集中 | ⚠️ 备选 |
| **C. 渐进两阶段** | 先补 `sandbox_permissions`（工具列表不变），验证后再禁 `tool-pwsh` | 1-2 天 | 风险分散、可回退、每阶段可验证 | 两步走 | ✅ **采纳** |

## 三、方案 C 详细设计

### 阶段 1：给 `pwsh_safe` 补沙箱升级（不改变工具列表）

#### 1.1 新增 `lib/dsh/sandbox.js`

从官方 `dsh-tool-pwsh/src/index.ts` 的 `approvePwshEscalation` 移植，只保留 `pwsh_safe` 需要的部分：

- `escalationModes(ctx)` — `ctx.shell.sandboxMode === undefined ? [] : ESCALATION_TARGETS`
- `resolveStandingPolicy(ctx, exec)` — `ctx.get('sandboxPolicy')?.resolve(...)`
- `approveSandboxEscalation(ctx, mode, justification, exec, standingPolicy)` — 调 `approveEscalation`

**依赖**：`@deepseek-ai/dsh-sandbox`（新增 peer dep，与官方同版本）。

#### 1.2 `lib/tool/schema.js`

新增两个参数（与官方 `pwsh` 同名）：

- `sandbox_permissions`: string（enum 由 `ESCALATION_TARGETS` 决定）
- `justification`: string（`sandbox_permissions` 必填时的说明）

**注意**：官方在 `escalationModes.length === 0` 时**不广告**这两个参数（headless 宿主没有沙箱）。`dsh-pwshx` 也要按 `ctx.shell.sandboxMode` 动态决定是否加。

#### 1.3 `lib/tool/pipeline.js`

`executePipeline(ctx, args, exec, config)` 开头加：

```js
const standing = resolveStandingPolicy(ctx, exec);
const approved = args.sandbox_permissions !== undefined && args.justification !== undefined
  ? await approveSandboxEscalation(ctx, args.sandbox_permissions, args.justification, exec, standing)
  : undefined;
const policy = approved === undefined ? standing : { ...standing, mode: approved };
```

然后 `buildShellSpec` 用 `policy`（而不是内部自己 resolve）。

#### 1.4 `lib/dsh/shell.js`

`buildShellSpec(ctx, request, exec, policyOverride)` 接受可选的 `policyOverride`，优先使用它。

#### 1.5 测试

- `test/sandbox.test.js`：`escalationModes` 空/非空；`approveSandboxEscalation` 在无 approval 服务时抛 `SandboxEscalationError`
- `test/pipeline.test.js`：带 `sandbox_permissions` 的 args 会传给 `approveEscalation`（stub）

**验收**：在 `workspace-write` 模式下，`pwsh_safe` 带 `sandbox_permissions: 'danger-full-access'` + `justification` 能成功升级（用户审批后）。

### 阶段 2：禁用官方 `pwsh`（切换点）

#### 2.1 profile `cordis.patch.yml`（`C:\Users\An1\.dsh\profiles\web\cordis.patch.yml`）

追加：

```yaml
- id: tool-pwsh
  disabled: true
```

**依据**：`dsh-base/cordis.patch.yml` 头部注释明确「user's profile cordis.patch.yml address these rows by id, with the last write winning per row」。

#### 2.2 `dsh-deep-ptc-mode/lib/preset.json`（agent 层）

把 `tool-pwsh` 行的 `disabled` 改成 `true`：

```json
{
  "id": "tool-pwsh",
  "name": "@deepseek-ai/dsh-tool-pwsh",
  "disabled": true
}
```

**注意**：`dsh-deep-ptc-mode` 升级会覆盖 → 需要 reapply 脚本（与 `model.mjs` 同机制）。

#### 2.3 验收

- `dsh --profile web --dump-config` 里 `tool-pwsh` 为 `disabled: true`
- 新会话的工具列表只有 `pwsh_safe` + `pwsh7_status` + `pwsh7_install`
- `pwsh_safe` 实际执行正常

### 阶段 3：文案与清理

| 文件 | 改动 |
|---|---|
| `dsh-deep-ptc-mode/lib/model.mjs:63` | `Use the pwsh_safe tool for PowerShell work...` 改成 `Use the pwsh_safe tool for all PowerShell work...`（删掉「Use pwsh only for background jobs」） |
| `lib/runtime/index.js` 的 `pwsh7_status` 描述 | 「Report which PowerShell the Harness **pwsh** tool runs on」→「Report which PowerShell **pwsh_safe** runs on」 |
| `lib/runtime/index.js` 的 `pwsh7_install` 描述 | 「the **pwsh tool** is ready」→「**pwsh_safe** is ready」 |
| `lib/runtime/index.js` 的 `tools.guard` | `if (exec.name !== 'pwsh' && exec.name !== 'pwsh_safe') return` → `if (exec.name !== 'pwsh_safe') return`（`pwsh` 分支死代码） |
| `lib/runtime/version-guard.js` 的 `denialText` | 文案里的「the pwsh tool would run」→「pwsh_safe would run」 |

## 四、风险与反思

| 风险 | 说明 | 缓解 |
|---|---|---|
| **`ctx.shell.sandboxMode` 时序** | `dsh-pwshx` 的 `apply` 时 `ctx.shell` 是否已加载？ | `pwsh-sandbox` 在 `dsh-base` 先加载，`dsh-pwshx` 在 bundle 后加载 → 已就绪。若为 undefined，`escalationModes` 为空 → 不广告参数（fail-safe） |
| **`ctx.get('approval')` 缺失** | headless 宿主没有审批服务 | `approveEscalation` 会抛 `SandboxEscalationError`，与官方一致 |
| **`dsh-deep-ptc-mode` 升级覆盖 preset** | 升级会重置 `disabled: true` | 写 reapply 脚本（与 `model.mjs` 同机制） |
| **两层 `tool-pwsh` 只禁一层** | 另一层会暴露 | 阶段 2 后 `dump-config` 验证两层都 `disabled` |
| **`pwsh` 的 `run_in_background` 丢失** | `pwsh_safe` 已有 `run_in_background` | 阶段 1 前已补（本次已完成） |
| **`pwsh` 的 `stopped`（外部 kill 原因）** | `pwsh_safe` 没有 | 评估是否补（低优先级） |

## 五、不做的事

- **不改执行器**（不继承 `SandboxPwshExecutor`）——这是 L3 的做法，长期耦合度高
- **不删 `pwsh7_status`/`pwsh7_install`**——它们是诊断/安装的恢复路径
- **不改 `pwsh_safe` 的 fix/check/gate/base64 逻辑**——阶段 1 只加沙箱升级

## 六、总工作量

| 阶段 | 预估 |
|---|---|
| 阶段 1（沙箱升级） | 1-1.5 天 |
| 阶段 2（禁用 `tool-pwsh`） | 0.5 天 |
| 阶段 3（文案清理） | 0.5 天 |
| **合计** | **2 天左右** |
---

## 执行结果（2026-11-17）

### 阶段 1：沙箱升级（完成）

| 文件 | 改动 |
|---|---|
| `lib/dsh/sandbox.js` | **新增 63 行**：`escalationModes` / `resolveStandingPolicy` / `approveSandboxEscalation` |
| `lib/dsh/shell.js` | `buildShellSpec`/`runViaShell` 加 `policyOverride` 参数 |
| `lib/tool/schema.js` | 新增 `SANDBOX_PARAMETERS`（仅在有 confining executor 时广告） |
| `lib/tool/register.js` | 动态拼参数（`escalationModes(ctx).length > 0`） |
| `lib/tool/pipeline.js` | 开头解析 standing policy + 审批，传给 `buildShellSpec` |
| `package.json` | 新增 peer dep `@deepseek-ai/dsh-sandbox` |
| `test/sandbox.test.js` | **新增 8 个测试**（`escalationModes`/`resolveStandingPolicy`/审批 allowed-once/same-mode/rejected/无沙箱抛错） |

**验证**：**184 / 184 测试通过**；集成 `approvals: 1`，reason = `escalate sandbox to danger-full-access: need to write outside the workspace`

### 阶段 2：禁用 `tool-pwsh`（完成）

| 位置 | 改动 |
|---|---|
| `C:\Users\An1\.dsh\profiles\web\cordis.patch.yml` | 追加 `- id: tool-pwsh` + `disabled: true`（global 层） |
| `dsh-deep-ptc-mode/lib/preset.json` | `plugins[4].disabled = { "__jsExpr": "true" }`（agent 层） |

**备份**：`D:\PortableApps\_backup\web-cordis.patch.yml.2026-11-17T06-42-34-073Z.bak`、`deep-ptc-preset.json.2026-11-17T06-42-34-073Z.bak`

**待重启验证**：`dump-config` 顶部已显示 `- id: tool-pwsh` + `disabled: true`；运行时工具列表需重启后确认。

### 阶段 3：文案清理（完成）

| 文件 | 改动 |
|---|---|
| `dsh-deep-ptc-mode/lib/model.mjs:63` | 「Use pwsh only for background jobs」→「Use pwsh_safe for all PowerShell work」（含 auto-fix/pitfall/gate/base64/background/escalation） |
| `lib/runtime/index.js` | `pwsh7_status` 描述「Harness pwsh tool」→「pwsh_safe」；gate 的 `pwsh` 分支清理 |
| `lib/runtime/constants.js` / `install.js` / `status.js` / `version-guard.js` | 「the pwsh tool」→「pwsh_safe」 |
| `lib/core/prompt.js` / `lib/tool/schema.js` | 「the built-in pwsh tool」→「the built-in PowerShell executor」 |
| `D:\PortableApps\_fix\dsh-deep-ptc-model.patched.mjs` | 模板同步新文案 |
| `D:\PortableApps\_fix\Reapply-DeepPtc-Patch.ps1` | 同时处理 `model.mjs` + `preset.json`（升级后可恢复） |

### 待办

- **重启 dsh web**，验证：工具列表只有 `pwsh_safe` + `pwsh7_status` + `pwsh7_install`，`pwsh` 不再出现
- 重启后实测 `pwsh_safe`（普通执行 + `run_in_background` + `sandbox_permissions`）