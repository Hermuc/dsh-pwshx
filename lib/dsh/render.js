/**
 * 结果渲染 —— 把结构化结果拼成模型可读文本。
 * 修复摘要必须排在输出最前面：模型需要立刻知道自己写的命令被改写成了什么。
 */

/** @param {any} value */
export function renderResult(value) {
  if (value?.kind === "background") {
    return [{ type: "text", text: "started background job " + value.jobId }];
  }
  /** @type {string[]} */
  const parts = [];

  if (Array.isArray(value?.fixes) && value.fixes.length > 0) {
    parts.push(
      value.fixes
        .map((f) => "[auto-fix] " + f.rule + ": " + (Array.isArray(f.notes) ? f.notes.join("; ") : ""))
        .join("\n")
    );
  }
  if (Array.isArray(value?.warnings) && value.warnings.length > 0) {
    parts.push(
      "[warnings]\n" +
        value.warnings.map((w) => "  - " + w.rule + ": " + w.note).join("\n")
    );
  }
  if (Array.isArray(value?.checks) && value.checks.length > 0) {
    parts.push(
      "[pitfall checks]\n" +
        value.checks.map((c) => "  - [" + c.id + "] " + c.title + (c.fix ? " → " + c.fix : "")).join("\n")
    );
  }

  if (typeof value?.fixedScript === "string" && value.fixedScript.length > 0) {
    parts.push("[fixed script]\n" + value.fixedScript);
  }
  if (value?.hadErrors === true) {
    parts.push("[stderr present with exit 0: the command reported errors but PowerShell returned success — check the output before relying on it]");
  }

  if (value?.refused === true) {
    parts.push("[refused] " + (value.refusalReason ?? "blocked before execution"));
  } else {
    const out = value?.stdout?.text ?? "";
    if (out.length > 0) parts.push(out);
    const err = value?.stderr?.text ?? "";
    if (err.length > 0) parts.push("[stderr]\n" + err);
    if (parts.length === 0) parts.push("(no output)");
    if (value?.stdout?.truncated) {
      parts.push("[stdout truncated; full output: " + (value.stdout.spillPath ?? "(unavailable)") + "]");
    }
    if (value?.stderr?.truncated) {
      parts.push("[stderr truncated; full output: " + (value.stderr.spillPath ?? "(unavailable)") + "]");
    }
    if (value?.timedOut) parts.push("[timed out]");
    if (value?.signal) parts.push("[killed by signal: " + value.signal + "]");
    else if (value?.exitCode !== 0 && value?.exitCode !== null) parts.push("[exit code: " + value.exitCode + "]");
  }

  return [{ type: "text", text: parts.join("\n") }];
}
