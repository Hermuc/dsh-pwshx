/**
 * runtime/note.js —— 给模型的一行运行时说明（pwsh 版本 / 无法启动）。
 */

import { MINIMUM_MAJOR } from "./constants.js";
import { effectiveRuntime, isSpawnable } from "./probe.js";

/**
 * The one line the model needs before it writes a pipeline. `&&` / `||` are valid in
 * PowerShell 7 and parse errors in Windows PowerShell 5.1.
 * @param version - the running PowerShell version, or `undefined` when unknown.
 * @returns the prompt text; `''` renders nothing, which is the honest answer when unknown.
 */
export function hintFor(version) {
  if (version === undefined) return ''
  const major = Number.parseInt(version.split('.')[0] ?? '', 10)
  return major >= MINIMUM_MAJOR
    ? `The \`pwsh\` tool on this machine runs PowerShell ${version}, so \`&&\` and \`||\` work in one command.`
    : `The \`pwsh\` tool is blocked by dsh-pwshx: it would run Windows PowerShell ${version}, where \`&&\` and \`||\` are parse errors. Do not call it or chain commands with \`;\`; tell the user PowerShell 7 must be installed or configured, then call pwsh7_status for the exact patch, call pwsh7_install only after they agree, or disable this plugin.`
}

/**
 * The prompt text for the whole runtime state — the version line, or the fact that the tool
 * cannot start at all.
 *
 * That second state is worth a line of its own: when an executor row pins a `pwshPath` that no
 * longer exists, the executor uses the pin and does not fall back, so **every** call fails with
 * a spawn error. Without the line the model rediscovers that by wasting calls; with it, it can
 * say what is wrong on the first try. `''` is the last-resort guard for a state nothing is known
 * about — it renders nothing rather than guessing.
 * @param rows - the probed executor rows.
 * @param status - the detection result, for the unpinned case.
 * @returns the prompt text, or `''`.
 */
export function runtimeNoteFor(rows, status) {
  const version = effectiveRuntime(rows, status)
  if (version !== undefined) return hintFor(version)
  const broken = rows.find((row) => row.pwshPath !== undefined && !isSpawnable(row.pwshPath))
  if (broken !== undefined) {
    return `The \`pwsh\` tool cannot start: an executor row pins ${broken.pwshPath}, which does not exist. dsh-pwshx blocks calls until this is fixed. Install PowerShell 7 from the Microsoft Store (\`pwsh7_install\`), call \`pwsh7_status\` for the exact patch, or disable this plugin if PowerShell 7 is not wanted here.`
  }
  return ''
}
