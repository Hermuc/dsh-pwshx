/**
 * 会话与工作目录解析：把 DSH 的会话 cwd / workdir 规则收敛到一处。
 * 纯函数 + 可选服务探测，不触碰执行通道。
 */
import { resolve } from "node:path";

/**
 * 把相对 workdir 解析到会话 cwd；绝对路径与 UNC 原样返回。
 * @param {string|undefined} workdir
 * @param {string|undefined} sessionCwd
 * @returns {string|undefined}
 */
export function resolveWorkdirPath(workdir, sessionCwd) {
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
export async function sessionCwd(ctx, exec) {
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
