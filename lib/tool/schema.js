/**
 * 工具对外契约：描述、参数 schema、输出 schema、拒绝骨架。
 * 纯数据 + 纯函数，不依赖 DSH 上下文，便于单测与复用。
 */

/** 拒绝执行时返回的固定骨架（与成功结果同形，便于 UI 渲染）。 */
export const REFUSED_BASE = Object.freeze({
  exitCode: null,
  signal: null,
  timedOut: false,
  aborted: false,
  refused: true,
  stdout: { text: "", truncated: false },
  stderr: { text: "", truncated: false },
});

export function toolDescription() {
  return (
    "Run a PowerShell script on Windows through the DSH pwsh executor. " +
    "Two protections in one call: (1) the script is auto-fixed for common Bash-isms before execution " +
    "(ls -la -> Get-ChildItem -Force, export X=Y -> $env:X='Y', /dev/null -> $null, CRLF/pasted prompts/" +
    "backslash continuations, and more); (2) the fixed script is base64-encoded so quotes, $, backslashes, " +
    "newlines and CJK text arrive exactly as written — no escaping gymnastics. " +
    "Write the script naturally as a multiline string. Each call runs in a fresh pwsh process: no state " +
    "(cwd, variables, functions) persists between calls — pass workdir instead of using cd. " +
    "Paths use native Windows form (C:\\...). Runs under the same sandbox as the built-in pwsh tool " +
    "(ConstrainedLanguage in read-only mode, spills long output, enforces timeouts). " +
    "Blocking pitfalls (e.g. bare npm/npx/pnpm without .cmd) are refused with a fix suggestion instead of running. " +
    "The result always reports what was auto-fixed and what was only warned about."
  );
}

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    exitCode: { oneOf: [{ type: "integer" }, { type: "null" }] },
    signal: { oneOf: [{ type: "string" }, { type: "null" }] },
    timedOut: { type: "boolean" },
    aborted: { type: "boolean" },
    refused: { type: "boolean" },
    refusalReason: { type: "string" },
    stdout: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        truncated: { type: "boolean" },
        spillPath: { type: "string" },
      },
      required: ["text", "truncated"],
    },
    stderr: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        truncated: { type: "boolean" },
        spillPath: { type: "string" },
      },
      required: ["text", "truncated"],
    },
    fixes: { type: "array", items: { type: "object", additionalProperties: true } },
    warnings: { type: "array", items: { type: "object", additionalProperties: true } },
    checks: { type: "array", items: { type: "object", additionalProperties: true } },
    fixedScript: { type: "string" },
    hadErrors: { type: "boolean" },
  },
  required: ["exitCode", "signal", "timedOut", "aborted", "refused", "stdout", "stderr"],
};

export const PARAMETERS = {
  type: "object",
  properties: {
    script: {
      type: "string",
      description:
        "The full PowerShell script to execute, as a line or multiline string. Do NOT escape quotes or backslashes — write it exactly as it should run. Common Bash-isms are detected and fixed automatically.",
    },
    description: {
      type: "string",
      description: "Clear, concise description of what this script does in active voice, 5-10 words (shown in the UI).",
    },
    workdir: {
      type: "string",
      description: "Working directory for this call. Defaults to the session workspace; a relative path resolves against it.",
    },
    timeoutMs: {
      type: "number",
      description: "Timeout in milliseconds (default 120000). The process is killed on expiry.",
    },
  },
  required: ["script", "description"],
};
