/**
 * 执行流水线：fix → check → gate → base64 → ctx.shell。
 * 只依赖 core/ 与 dsh/shell，不碰工具注册，方便单测与复用。
 */
import { fix } from "../core/fixer.js";
import { check, formatHits } from "../core/pscheck.js";
import { filterChecks } from "../core/checkgate.js";
import { executionGate } from "../core/gate.js";
import { encodeScript } from "../core/encode.js";
import { runViaShell } from "../dsh/shell.js";
import { REFUSED_BASE } from "./schema.js";
import { resolveWorkdirPath, sessionCwd } from "./session.js";

/**
 * 校验工具参数；不合法直接抛错（DSH 会把 message 回给模型）。
 * @param {any} args
 */
export function validateArgs(args) {
  if (typeof args?.script !== "string" || args.script.trim().length === 0) {
    throw new Error("pwsh_safe needs a non-empty string script");
  }
  if (typeof args?.description !== "string" || args.description.trim().length === 0) {
    throw new Error("pwsh_safe needs a non-empty string description");
  }
}

/**
 * 跑完整流水线。
 * @param {any} ctx
 * @param {any} args
 * @param {any} exec
 * @param {import("../config.js").PluginConfig} config
 * @returns {Promise<any>}
 */
export async function executePipeline(ctx, args, exec, config) {
  validateArgs(args);
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
}
