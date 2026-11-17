# lib/runtime — PowerShell 7 运行时层

本目录由上游 `dsh-win-pwsh7@0.2.11` 的 1604 行单文件按职责拆分而来。

## 模块边界（严格单向依赖，无循环）

```
util.js        纯工具：describe / isSet / flattenReport / majorOf / envMs
constants.js   全部常量（executor 包名、Store 路径正则、超时、安装提示文本）
state.js       每 Host 上下文的运行时状态 + 行配置快照 + hostContext 访问器
probe.js       探测原语：probeVersion / validateCandidate / effectiveRuntime ...
detect.js      detect（探测最佳候选） / executorRows（探测 executor 行）
note.js        hintFor / runtimeNoteFor（给模型的一行版本说明）
status.js      reportOutput / renderStatus（工具 + 插件页共用的状态报告）
version-guard.js  shellRuntimeReading / gateFromReading / refreshGate / denialText（版本闸）
install.js     Store 安装：spawnStoreUi / storeUiJobSpec / runInstall
dispatch.js    Pwsh7Dispatch（typert Remote service）
index.js       applyRuntime / activationSweep（只做编排）
```

依赖方向：`util → constants → state → probe → detect → note → gate → status → install → dispatch → index`。

## 为什么保留上游代码风格

`probe.js` / `status.js` / `version-guard.js` / `install.js` 等文件里的函数体来自上游，
保留其原始风格（单引号、无分号），**目的是让上游升级时的 diff 只显示真正的逻辑变化**，
而不是被格式化淹没。新增的头部/import 使用本仓库风格（双引号 + 分号）。

## 升级上游时怎么做

1. 下载新的 `dsh-win-pwsh7/index.js`；
2. 按 `REFACTOR-PLAN.md` 的模块映射逐个对比函数；
3. 只把有变化的函数搬进来，保持模块边界不变；
4. 跑 `node --test`（163 个用例）。
