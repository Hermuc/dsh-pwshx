# Changelog

## 0.1.0

- **合并** `dsh-tool-pwsh-safe-plus`（0.2.13）与 `dsh-win-pwsh7`（0.2.11）为一个插件。
- 新增 `lib/runtime/`：PowerShell 7 检测、gate、状态报告、Store 安装。
- 新增 `lib/bridge/utf8-console.js`：UTF-8 代码页 bridge（独立模块）。
- gate 同时保护 `pwsh` 与 `pwsh_safe`（修复旧版只拦 `pwsh` 的缺口）。
- 保留原有 `pwsh_safe` 能力（auto-fix / pscheck / base64 / here-string）。
- 配置合并为 7 个键：`fixLevel` / `checkMode` / `shell` / `timeoutMs` / `maxEncodedChars` / `overridePath` / `utf8Console`。
