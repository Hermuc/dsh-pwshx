/**
 * 给模型的 systemPrompt 段。
 *
 * 与官方 `tool:pwsh`（dsh-tool-pwsh）和 `tool:pwsh-runtime`（dsh-win-pwsh7）并列，
 * 但使用独立的段名，避免与两者冲突。段落内容只描述 pwsh_safe 的增量能力，
 * 不重复官方 pwsh 的通用说明。
 */

/** 段名：必须与 tool:pwsh / tool:pwsh-runtime 区分。 */
export const PROMPT_SECTION_NAME = "tool:pwshx";

export function promptText() {
  return (
    "pwsh_safe runs a PowerShell script through the same executor as the built-in pwsh tool, " +
    "with two extra guarantees: (1) the script is auto-fixed for common Bash-isms before it runs " +
    "(ls -la -> Get-ChildItem -Force, export X=Y -> $env:X=Y, /dev/null -> $null, CRLF / pasted prompts / " +
    "backslash line-continuations), and (2) it is base64-encoded, so quotes, $, backslashes, newlines and " +
    "CJK text need no escaping. Prefer pwsh_safe when a script is multi-line, contains nested quotes or " +
    "Chinese text, or was drafted with bash habits. Read the [auto-fix] lines in the result to see what " +
    "changed; blocking pitfalls are refused with a fix suggestion instead of running."
  );
}
