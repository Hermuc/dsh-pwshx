/**
 * 平台与 shell 解析 —— 不做任何子进程探测。
 *
 * 上游 powershell-fix 的 detectWindowsEngine() 会 spawnSync("pwsh")：
 *  - 阻塞事件循环最长 5 秒；
 *  - 在受限沙箱里可能直接被拒绝；
 *  - 一旦误判成 powershell51，会把合法的 `&&` 拆成 `; if ($?) { ... }`，等于改错脚本。
 *
 * 本插件最终仍走 ctx.shell，PowerShell 版本由 dsh-pwshx 自己的运行时层（lib/runtime/）保证，
 * 因此这里只做静态解析：版本由配置显式给出，默认 pwsh。
 */

/** @returns {string} 'win32' | 'linux' | 'darwin' ... */
export function hostPlatform() {
  return process.platform === "win32" ? "win32" : process.platform;
}

/**
 * @param {'auto'|'pwsh'|'powershell51'|'bash'|undefined} explicit
 * @param {string} [platform]
 * @returns {'pwsh'|'powershell51'|'bash'}
 */
export function resolveShell(explicit, platform = hostPlatform()) {
  if (explicit && explicit !== "auto") return explicit;
  return platform === "win32" ? "pwsh" : "bash";
}

/** @param {string} shell */
export function isWindowsShell(shell) {
  return shell === "pwsh" || shell === "powershell51";
}
