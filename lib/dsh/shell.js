/**
 * ctx.shell 适配层 —— 唯一与 DSH 执行器耦合的地方。
 *
 * DSH 0.2.x 的 shell seam 只提供三个入口：
 *   ctx.shell.resolve(request)  -> spec
 *   await ctx.shell.execute(spec) -> handle
 *   await handle.result()       -> ShellRunResult
 *
 * 特别提醒：不存在 ctx.shell.run(...)。上游 dsh-tool-pwsh-safe@0.1.1 与
 * powershell-fix@0.1.0 都误用了这个不存在的 API（详见 README 的「为什么」）。
 *
 * 沙箱策略：dsh-pwsh-sandbox 的 resolve() 在 request 未带 sandboxPolicy 时
 * 退回到「部署默认值」（workspace-write），而不是当前会话解析出的模式
 * （danger-full-access）。因此这里必须按会话解析并显式传入，与官方
 * dsh-tool-pwsh 的 resolveSandboxPolicy(exec) 保持一致。
 */

/**
 * @typedef {Object} NormalizedStream
 * @property {string} text
 * @property {boolean} truncated
 * @property {string} [spillPath]
 *
 * @typedef {Object} NormalizedResult
 * @property {number|null} exitCode
 * @property {string|null} signal
 * @property {boolean} timedOut
 * @property {boolean} aborted
 * @property {NormalizedStream} stdout
 * @property {NormalizedStream} stderr
 */

/** @param {unknown} s @returns {NormalizedStream} */
export function normalizeStream(s) {
  const v = /** @type {any} */ (s) ?? {};
  /** @type {NormalizedStream} */
  const out = { text: typeof v.text === "string" ? v.text : "", truncated: v.truncated === true };
  if (typeof v.spillPath === "string") out.spillPath = v.spillPath;
  return out;
}

/**
 * 把 executor 的返回形状归一化，保证永远满足输出 schema。
 * @param {any} result
 * @returns {NormalizedResult}
 */
export function normalizeResult(result) {
  const r = result ?? {};
  return {
    exitCode: typeof r.exitCode === "number" ? r.exitCode : null,
    signal: typeof r.signal === "string" ? r.signal : null,
    timedOut: r.timedOut === true,
    aborted: r.aborted === true,
    stdout: normalizeStream(r.stdout),
    stderr: normalizeStream(r.stderr),
  };
}

/**
 * 按会话解析沙箱策略；服务缺失时返回 undefined（交给执行器兜底）。
 * 与 @deepseek-ai/dsh-tool-pwsh 的 resolveSandboxPolicy 同一口径。
 *
 * @param {any} ctx
 * @param {any} exec
 * @returns {any|undefined}
 */
export function resolveSandboxPolicy(ctx, exec) {
  /** @type {any} */
  const service =
    typeof ctx?.get === "function" ? ctx.get("sandboxPolicy") : ctx?.sandboxPolicy;
  if (service === undefined || service === null || typeof service.resolve !== "function") return undefined;
  const session = exec?.agent?.session;
  return service.resolve(session === undefined ? {} : { session });
}

/**
 * 通过 ctx.shell 执行一条命令。
 *
 * @param {any} ctx
 * @param {{command: string, workdir?: string, timeoutMs: number, signal?: AbortSignal}} request
 * @param {any} exec 工具执行上下文（用于 shellEnv.collect 与会话级策略）
 * @returns {Promise<NormalizedResult>}
 */
export async function runViaShell(ctx, request, exec) {
  const sandboxPolicy = resolveSandboxPolicy(ctx, exec);
  /** @type {any} */
  const spec = ctx.shell.resolve({
    command: request.command,
    timeoutMs: request.timeoutMs,
    dshEnv: ctx.shellEnv.collect(exec),
    ...(request.workdir !== undefined ? { workdir: request.workdir } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(sandboxPolicy !== undefined ? { sandboxPolicy } : {}),
  });
  const handle = await ctx.shell.execute(spec);
  const result = await handle.result();
  return normalizeResult(result);
}
