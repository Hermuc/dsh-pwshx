/**
 * 沙箱升级适配层 —— 从官方 @deepseek-ai/dsh-tool-pwsh/src/index.ts 的 approvePwshEscalation 移植。
 *
 * 只负责三件事：
 *   1. 判断当前组合是否有可升级的沙箱（ctx.shell.sandboxMode）
 *   2. 解析会话的 standing policy（ctx.get('sandboxPolicy')）
 *   3. 把 sandbox_permissions + justification 交给官方 approveEscalation 走审批
 */
import { ESCALATION_TARGETS, SandboxEscalationError, approveEscalation, validateEscalationArgs } from "@deepseek-ai/dsh-sandbox";

/**
 * The escalation targets this composition advertises: empty without a confining executor.
 * @param {any} ctx
 * @returns {readonly string[]}
 */
export function escalationModes(ctx) {
  const mode = ctx?.shell?.sandboxMode;
  return mode === undefined ? [] : ESCALATION_TARGETS;
}

/**
 * Resolve the session's standing sandbox policy, mirroring the official tool.
 * @param {any} ctx
 * @param {any} exec
 * @returns {any|undefined}
 */
export function resolveStandingPolicy(ctx, exec) {
  const service = typeof ctx?.get === "function" ? ctx.get("sandboxPolicy") : ctx?.sandboxPolicy;
  if (service === undefined || service === null || typeof service.resolve !== "function") return undefined;
  const session = exec?.agent?.session;
  return service.resolve(session === undefined ? {} : { session });
}

/**
 * Resolve one escalation request through ctx.approval BEFORE anything executes.
 * Throws SandboxEscalationError when this composition has no confining executor.
 * @param {any} ctx
 * @param {string} mode - the requested sandbox_permissions value.
 * @param {string} justification - the user-facing reason.
 * @param {any} exec
 * @param {any} standingPolicy
 * @returns {Promise<string>} the approved mode.
 */
export async function approveSandboxEscalation(ctx, mode, justification, exec, standingPolicy) {
  if (escalationModes(ctx).length === 0) {
    throw new SandboxEscalationError(
      "sandbox_permissions is not available in this composition (no sandboxing executor to escalate)",
      "SANDBOX_ESCALATION_UNAVAILABLE",
    );
  }
  validateEscalationArgs(mode, justification);
  const effectiveMode = standingPolicy?.mode;
  return approveEscalation(
    { requestedMode: mode, justification, effectiveMode, subject: "command" },
    {
      approver: typeof ctx?.get === "function" ? ctx.get("approval") : ctx?.approval,
      agent: exec?.agent,
      callId: exec?.callId,
      toolName: "pwsh_safe",
      signal: exec?.signal,
    },
  );
}