/**
 * dsh-tool-pwsh-safe-plus —— 单一执行路径：语法自动修复 + 转义物理免疫。
 *
 * 设计要点：
 *  - core/ 全是纯函数（可脱离 DSH 单测）；
 *  - dsh/ 只做上下文适配（ctx.shell / render）；
 *  - 本文件只做编排，不含规则与 IO 细节。
 *
 * 流水线：明文 → fix() → check() → gate() → base64 → ctx.shell.execute()
 */

import { resolve } from "node:path";

import { normalizeConfig } from "./config.js";
import { fix } from "./core/fixer.js";
import { check, formatHits } from "./core/pscheck.js";
import { filterChecks } from "./core/checkgate.js";
import { PROMPT_SECTION_NAME, promptText } from "./core/prompt.js";
import { executionGate } from "./core/gate.js";
import { encodeScript } from "./core/encode.js";
import { runViaShell } from "./dsh/shell.js";
import { renderResult } from "./dsh/render.js";

export const name = "tool-pwsh-safe-plus";
export const inject = ["tools", "shell", "shellEnv"];

const REFUSED_BASE = Object.freeze({
  exitCode: null,
  signal: null,
  timedOut: false,
  aborted: false,
  refused: true,
  stdout: { text: "", truncated: false },
  stderr: { text: "", truncated: false },
});

function toolDescription() {
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

const OUTPUT_SCHEMA = {
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
  },
  required: ["exitCode", "signal", "timedOut", "aborted", "refused", "stdout", "stderr"],
};

/**
 * 把相对 workdir 解析到会话 cwd；绝对路径与 UNC 原样返回。
 * @param {string|undefined} workdir
 * @param {string|undefined} sessionCwd
 * @returns {string|undefined}
 */
function resolveWorkdirPath(workdir, sessionCwd) {
  if (typeof workdir !== "string" || workdir.length === 0) return sessionCwd;
  if (/^[a-zA-Z]:[\\/]/.test(workdir) || workdir.startsWith("\\\\")) return workdir;
  return sessionCwd !== undefined ? resolve(sessionCwd, workdir) : undefined;
}

/**
 * 会话工作目录：优先用 ctx.workingDirectory.ensure（与官方 pwsh 工具同一口径），
 * 服务缺失时退回 session.header.cwd。两者都拿不到就交给执行器默认值。
 *
 * @param {any} ctx
 * @param {any} exec
 * @returns {Promise<string|undefined>}
 */
async function sessionCwd(ctx, exec) {
  const fallback = exec?.agent?.session?.header?.cwd;
  const service = typeof ctx?.get === "function" ? ctx.get("workingDirectory") : ctx?.workingDirectory;
  if (service === undefined || service === null || typeof service.ensure !== "function" || exec?.agent === undefined) {
    return fallback;
  }
  try {
    return await service.ensure(exec.agent, exec.signal);
  } catch {
    return fallback;
  }
}

/**
 * @param {any} ctx
 * @param {Partial<import("./config.js").PluginConfig>} [rawConfig]
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);

  // 可选注入：systemPrompt 服务缺失时（headless 极简宿主）插件仍要能加载。
  if (typeof ctx.inject === "function") {
    ctx.inject(["systemPrompt"], (scoped) => {
      try {
        scoped.systemPrompt.section({
          name: PROMPT_SECTION_NAME,
          order: typeof scoped.systemPrompt.getSectionOrder === "function" ? scoped.systemPrompt.getSectionOrder("TOOL_PWSH") : 200,
          text: promptText(),
        });
      } catch (error) {
        ctx.logger?.warn?.("pwsh-safe-plus: could not register the prompt section: " + String(error));
      }
    });
  }

  ctx.tools.register({
    name: "pwsh_safe",
    description: toolDescription(),
    parameters: {
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
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({
      card: "generic",
      title: (args?.description || "pwsh_safe").slice(0, 80),
      kind: "execute",
      rawInput: args,
    }),

    async execute(args, exec) {
      if (typeof args?.script !== "string" || args.script.trim().length === 0) {
        throw new Error("pwsh_safe needs a non-empty string script");
      }
      if (typeof args?.description !== "string" || args.description.trim().length === 0) {
        throw new Error("pwsh_safe needs a non-empty string description");
      }
      const timeoutMs =
        Number.isFinite(args?.timeoutMs) && args.timeoutMs > 0 ? Math.floor(args.timeoutMs) : config.timeoutMs;

      // ① 前置修复（明文阶段，所以能看穿、能改写）
      const fx =
        config.fixLevel === "off"
          ? { fixed: args.script, changed: false, fixes: [], warnings: [], platform: "win32", shell: config.shell, level: "off" }
          : fix(args.script, { platform: "win32", shell: config.shell, level: config.fixLevel });

      // ② 坑位静态检查（阻断级直接拒绝，绝不执行）
      //    R3/R11 只在 PowerShell 5.1 成立；pwsh 7 下必须过滤，否则正常的 && 会被误拒。
      let advisory = [];
      if (config.checkMode !== "off") {
        const chk = check(fx.fixed);
        const applicable = filterChecks(chk.all, config.shell);
        const blocking = applicable.filter((r) => r.severity === "blocking");
        advisory = applicable.filter((r) => r.severity === "advisory");
        if (config.checkMode === "block" && blocking.length > 0) {
          return {
            ...REFUSED_BASE,
            refusalReason:
              "blocking PowerShell pitfall(s) detected — not executed. Apply the suggested fix and retry:\n" +
              formatHits(blocking, "zh"),
            fixes: fx.fixes,
            warnings: fx.warnings,
            checks: blocking.map((r) => ({ id: r.id, title: r.title, fix: r.fix })),
          };
        }
      }

      // ③ 危险命令闸（防止被修复「洗白」后执行破坏性命令）
      const gate = executionGate(fx.fixed);
      if (gate !== null) {
        return {
          ...REFUSED_BASE,
          refusalReason: "dangerous command — refused auto-execution: " + gate,
          fixes: fx.fixes,
          warnings: fx.warnings,
          checks: advisory.map((r) => ({ id: r.id, title: r.title, fix: r.fix })),
        };
      }

      // ④ Base64（此时才是密文；前面的检查全部完成）
      const { invocation } = encodeScript(fx.fixed, { maxChars: config.maxEncodedChars });

      // ⑤ 执行目录
      const cwd = await sessionCwd(ctx, exec);
      const workdir = resolveWorkdirPath(args?.workdir, cwd);

      // ⑥ 走官方 ctx.shell（与内置 pwsh 同一条通道 → 继承 dsh-win-pwsh7 的路由）
      const result = await runViaShell(
        ctx,
        { command: invocation, timeoutMs, workdir, signal: exec?.signal },
        exec
      );

      if (result.aborted) {
        const err = new Error("tool call aborted");
        err.name = "AbortError";
        throw err;
      }

      return {
        ...result,
        refused: false,
        refusalReason: "",
        fixes: fx.fixes,
        warnings: fx.warnings,
        checks: advisory.map((r) => ({ id: r.id, title: r.title, fix: r.fix })),
      };
    },
  });
}
