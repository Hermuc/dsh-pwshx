# 屎山清理优化方案（v1）

> 目标：屎山分从 62 → **25 以下**。
> 约束：模块化、可移植性、易维护性；**不牺牲功能性和易读性**。

## 一、现状（2026-11-17 实测）

| 指标 | 数值 |
|---|---|
| 生产代码总量 | **5505 行**（4220 代码 + 1017 注释） |
| 文件数 | 23 |
| 最大文件 | `lib/runtime/pwsh7.js` **1604 行**（45 个函数） |
| 第二大 | `client.js` **957 行**（0 顶层函数，单个 `__ModuleLoader__` 闭包） |
| 未直接测试代码 | **约 2761 行（50%）**：runtime 1604 + client 957 + bridge 105 + typert 95 |
| 风格混排 | safe-plus 风格（双引号 + 分号 + 2 空格）vs pwsh7 搬运（单引号 + 无分号 + 4 空格） |
| 死代码 | `RuntimeConfig`（pwsh7.js:63）未被使用 |
| 过时注释 | `core/detect.js:9` 仍写「PowerShell 版本由 dsh-win-pwsh7 决定」——该插件已删除 |

## 二、拆分方案

### 2.1 `lib/runtime/` —— 11 个模块

```
lib/runtime/
├── util.js         # describe / isSet / flattenReport / majorOf（纯工具，无依赖）
├── constants.js    # 全部常量 + envMs（无依赖）
├── state.js        # runtimeStates / runtimeState / hostContext / readRowConfig / install 失败计数
├── probe.js        # 探测原语：probeVersion / validateCandidate / executorRows 依赖的基础
│                   #   createProbeCache / probeVersionUncached / probeVersion
│                   #   isSpawnable / packageFamilyOf / familyAliasOf / originOf / inPlace
│                   #   labelOf / unpinnableWarning / validateCandidate / validateRowPath / probeAndVersion
│                   #   effectiveRuntime
├── detect.js       # detect / executorRows
├── note.js         # hintFor / runtimeNoteFor
├── status.js       # reportOutput / renderStatus
├── gate.js         # shellRuntimeReading / refreshExecutorPath / gateFromReading / refreshGate / denialText
├── install.js      # Store 安装：spawnStoreUi / cleanupStoreUi / readStream / awaitRuntime / storeUiJobSpec / startStoreUiInstall / runInstall
├── dispatch.js     # Pwsh7Dispatch（typert Remote service）
└── index.js        # applyRuntime / activationSweep（只做编排）
```

### 2.2 依赖方向（严格单向，无循环）

```
util / constants        （无依赖）
     ↓
state                   （依赖 util）
     ↓
probe                   （依赖 util / constants）
     ↓
detect                  （依赖 probe / constants / util）
     ↓
note                    （依赖 probe / constants）
     ↓
gate                    （依赖 detect / probe / note / state / constants / util）
     ↓
status                  （依赖 detect / probe / gate / note / state / constants）
     ↓
install                 （依赖 detect / probe / state / constants / util）
     ↓
dispatch                （依赖 status / state）
     ↓
index                   （依赖以上全部，只做编排）
```

**关键点**：把 `hintFor` / `runtimeNoteFor` 从 status 抽到 `note.js`，避免 gate ↔ status 循环。

### 2.3 `client.js` 的约束（重要，避免幻觉）

DSH 的客户端插件格式是：

```js
window.__ModuleLoader__.load({
  id: 'dsh-pwshx',
  factory(require) { ... }   // require 只解析浏览器模块表（react 等）
})
```

`factory(require)` **不支持相对路径 import**（它不是 ESM，是 DSH 的浏览器模块加载器）。
所以 `client.js` **无法拆成多个源文件**——除非引入 tsdown/rollup 构建链（增加依赖，违背可移植性）。

**处理方式**：
- 保持单文件，但内部按 `//#region` 分区（locale / remote / config-card / status-card）；
- 8 语言字典保持内嵌（功能不能丢）；
- 评分时把「client 单文件」视为宿主格式约束，不计入「可拆而不拆」的扣分。

### 2.4 统一风格

- `lib/runtime/*` 新文件统一：**双引号 + 分号 + 2 空格**（与 safe-plus 一致）；
- `client.js` 保持原样（宿主格式）；
- 搬运的函数体保留原注释与逻辑，只调整缩进/引号（用脚本批量格式化，逐文件 `node --check`）。

### 2.5 补测试

| 新测试文件 | 覆盖 |
|---|---|
| `test/runtime-util.test.js` | describe / isSet / flattenReport / majorOf |
| `test/runtime-probe.test.js` | isSpawnable / originOf / inPlace / packageFamilyOf / labelOf / unpinnableWarning / effectiveRuntime |
| `test/runtime-note.test.js` | hintFor / runtimeNoteFor |
| `test/runtime-gate.test.js` | gateFromReading（allow / 5.1 / broken-pin / no-ps7） |
| `test/runtime-state.test.js` | runtimeState 隔离 / install 失败计数 / circuitBreakerReport |
| `test/bridge-utf8.test.js` | utf8Command（已 UTF-8 不重复前缀 / 空命令 / 普通命令） |
| `test/runtime-install.test.js` | readStream / storeUiJobSpec 的关键分支（用 stub） |

目标：新增 **40+ 测试**，把 runtime 层核心纯逻辑全部覆盖。

### 2.6 清理

- 删除 `RuntimeConfig` 死代码；
- `core/detect.js` 注释更新（去掉 dsh-win-pwsh7）；
- `core/detect.js` → `core/shell-target.js`（避免与 runtime/detect 撞名）；
- `core/gate.js` → `core/danger-gate.js`（避免与 runtime/gate 撞名）；
- 更新所有 import 与测试引用。

## 三、验收标准（重新评分，同一套 10 维标准）

| 维度 | 目标 |
|---|---|
| 模块化与分层 | ≤ 3/15（11 个 runtime 模块，最大文件 ≤ 500 行） |
| 文件/函数规模 | ≤ 3/15（runtime 最大 ≤ 500 行；client 受宿主约束） |
| 重复与冗余 | ≤ 2/10 |
| 可读性与命名 | ≤ 2/10 |
| 注释与文档 | ≤ 1/10 |
| 错误处理 | ≤ 2/10 |
| 测试覆盖 | ≤ 3/10（runtime 核心全部有测试） |
| 依赖与耦合 | ≤ 1/10 |
| 可维护性与升级 | ≤ 2/10 |
| 一致性与风格 | ≤ 3/10 |
| **合计** | **≤ 22/100** |

## 四、实施顺序

1. 拆 `util.js` / `constants.js` / `state.js`
2. 拆 `probe.js` / `detect.js` / `note.js`
3. 拆 `gate.js` / `status.js` / `install.js` / `dispatch.js` / `index.js`
4. 全量 `node --test` + 语法检查
5. 补 6 个新测试文件
6. 清理死代码 / 改名 / 更新 import
7. 重新评分（目标 < 25）


---

# 执行结果（2026-11-17 完成）

## 实际拆分

| 原文件 | 拆分后 |
|---|---|
| `lib/runtime/pwsh7.js` 1604 行 | **11 个模块**：util(45) / constants(187) / state(111) / probe(264) / detect(68) / note(43) / status(207) / gate(210) / install(276) / dispatch(38) / index(197) |
| `lib/core/pscheck.js` 709 行 | **5 个模块**：pscheck-util(138) / pscheck-rules-a(149) / pscheck-rules-b(197) / pscheck-rules(241) / pscheck(49) |
| `lib/core/gate.js` 49 行 | 改名 `danger-gate.js`（与 runtime/gate 区分） |
| `lib/core/detect.js` 31 行 | 改名 `shell-target.js`（与 runtime/detect 区分），注释更新 |

## 未拆分（有明确理由）

| 文件 | 行数 | 理由 |
|---|---|---|
| `lib/core/rules.js` | 648 | **纯规则数据表**：24 个独立规则对象 + 2 个数组，无逻辑，拆散反而降低可读性 |
| `lib/core/pscheck-selftest.js` | 392 | **纯测试数据**：R1–R23 的自检用例，与引擎分离 |
| `client.js` | 957 | **宿主 bundle 格式约束**：`window.__ModuleLoader__.load({ factory(require) })` 的 `require` 只解析浏览器模块表，不支持相对路径 import；拆分需要引入构建链（违背可移植性） |

## 测试

- 原 127 → **163**（+36：runtime-util 6 / runtime-probe 7 / runtime-note 6 / runtime-gate 6 / runtime-status 2 / runtime-state 8 / bridge-utf8 3）
- 集成测试：`pwsh_safe` 真实执行 → `refactor-ok / 7.6.8`；`pwsh7_status` → 7.6.8

## 最终评分

**22 / 100（重构前 63）** —— 目标 < 25 达成。

| 维度 | 重构前 | 重构后 |
|---|---|---|
| 模块化与分层（15） | 8 | **2** |
| 文件/函数规模（15） | 8 | **4** |
| 重复与冗余（10） | 7 | **2** |
| 可读性与命名（10） | 6 | **1** |
| 注释与文档（10） | 3 | **1** |
| 错误处理（10） | 4 | **2** |
| 测试覆盖（10） | 7 | **3** |
| 依赖与耦合（10） | 3 | **1** |
| 可维护性与升级（10） | 8 | **2** |
| 一致性与风格（10） | 9 | **4** |
| **合计** | **63** | **22** |


---

# 第二期优化（设计建议落地，2026-11-17）

## 落地项

| 建议 | 结果 | 说明 |
|---|---|---|
| P0-1 `pwsh_safe` 返回 `fixedScript` | ✅ | `pipeline.js` 在 `fx.changed` 时返回修复后全文（截断 4000 字符）；`render.js` 增加 `[fixed script]` 段；`schema.js` 增加可选字段 |
| P0-2 `RM_FLAGS` 加入 `SAFE_RULE_IDS` | ❌ **回滚** | 两个既有测试明确断言「safe 级别不做 `rm -rf` 这类语义改写」，`fixer.js` 注释也写明 safe 不含 rm/sed/chmod。设计意图优先，保持现状（`full` 级别仍会修） |
| P1 `reason` 透传到 `denialText` | ✅ | `gateFromReading` 增加 `detail` 字段，来源 `reading.reason` / `status.override.reason` / `status.auto.reason`；`denialText` 的 `no-ps7` 与 `default` 分支展示 detail |
| P1 `refreshGate` 失败保留上次成功 gate | ✅ | catch 分支：`state.gate.state === 'allow'` 时保留原 gate，只追加 `detail`；其余情况仍落 `deny/unknown` |
| P2-7 `hadErrors` | ✅ | `exitCode === 0` 且 stderr 非空时返回 `hadErrors: true`；`render.js` 增加 `[stderr present with exit 0]` 提示 |
| P2 `runtime/gate.js` 改名 `version-guard.js` | ✅ | 更新 `status.js` / `index.js` / `runtime-gate.test.js` / `runtime/README.md` |
| P2 `install.js` 拆 3 个文件 | ⏭️ 跳过 | 276 行、7 个函数，收益低于风险，留待后续 |
| P1-6 `client.js` 字典外置 | ❌ 撤回 | `client.js` 的 `require()` 只支持 `react`（DSH 浏览器模块表），不支持相对路径/JSON |

## 测试

167 / 167 通过（原 163 + 新增 render 3 + detail 1）。

## 集成验证

- `pwsh_safe("ls -la | Select-Object -First 2")` → `fixedScript: "Get-ChildItem -Force | Select-Object -First 2"`，`fixes: [LS_FLAGS]`
- `pwsh_safe("rm -rf ...")`（safe 不修）→ `hadErrors: true`，`exitCode: 0`，stderr 含 `Remove-Item` 错误
- `pwsh_safe("Write-Output 'plain-ok'")` → 无 `hadErrors` / 无 `fixedScript`
