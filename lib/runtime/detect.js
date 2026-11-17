/**
 * runtime/detect.js —— 检测候选 PowerShell 与 executor 行。
 */

import { resolvePwshPath } from "@deepseek-ai/dsh-pwsh-local";
import { EXECUTOR_PACKAGES } from "./constants.js";
import { familyAliasOf, inPlace, labelOf, validateCandidate, validateRowPath } from "./probe.js";
import { isSet } from "./util.js";

/**
 * Resolve the best PowerShell 7 candidate on this machine: ① the configured `overridePath`,
 * ② the auto-probe. Each candidate is validated independently; a rejected ① falls through
 * to ②.
 * @param ctx - the row's Host context.
 * @param config - the resolved row configuration.
 * @param cache - the reading cycle's probe memo.
 * @returns the detection result with `chosen` set to the best acceptable candidate.
 */
export async function detect(ctx, config, cache) {
  const override = isSet(config?.overridePath)
    ? await validateCandidate(ctx, config.overridePath, cache)
    : undefined
  const resolved = await validateCandidate(ctx, resolvePwshPath(undefined, process.env, 'win32'), cache)
  // The upstream resolver reports the version-numbered Store path (MSIX activation puts that
  // directory at the head of PATH). The pinnable form is the family alias beside it, so prefer
  // it whenever it exists: it is the same runtime through a path Store updates do not move.
  const alias = resolved?.origin === 'store-package' ? familyAliasOf(resolved.path) : undefined
  const auto = alias === undefined ? resolved : await validateCandidate(ctx, alias, cache)
  return {
    override,
    auto,
    // What counts as "already usable": an ordinary file or the Store family alias.
    chosen: [override, auto].find((candidate) => candidate?.usable === true && inPlace(candidate.origin)),
  }
}

/**
 * The PowerShell executor rows and the `pwshPath` each one declares, probed for what they
 * actually run today.
 *
 * `probed` is what the pinned path reports, whatever version it is, because that is what the
 * `pwsh` tool will run; `version` is set only when the path is a PowerShell this plugin would
 * itself use. The report reads `version`; the prompt section reads `probed`.
 * @param ctx - the row's Host context.
 * @param cache - the reading cycle's probe memo.
 * @returns one entry per executor row, each with a report line and, when usable, its version and origin.
 */
export async function executorRows(ctx, cache) {
  const rows = []
  for (const entry of ctx.configEditor.entries()) {
    if (!EXECUTOR_PACKAGES.has(entry?.options?.name)) continue
    const declared = entry.options?.config?.pwshPath
    const id = String(entry.options?.id)
    // Carry the entry's disabled flag through: a disabled row does not run, so it must not be the
    // row the report names as the runtime (and it is why `effectiveRuntime` filters on this).
    const disabled = entry.disabled === true || entry.options?.disabled === true
    if (!isSet(declared)) {
      rows.push({ id, disabled, pwshPath: undefined, config: entry.options?.config ?? {}, text: `${id} : (pwshPath not set — the executor probes well-known locations itself)` })
      continue
    }
    const pwshPath = String(declared)
    const check = await validateRowPath(ctx, pwshPath, cache)
    rows.push(check.usable
      ? { id, disabled, pwshPath, config: entry.options?.config ?? {}, version: check.version, probed: check.version, origin: check.origin, text: `${id} : pwshPath = ${pwshPath} (PowerShell ${check.version}, ${labelOf(check)})` }
      : { id, disabled, pwshPath, config: entry.options?.config ?? {}, probed: check.version, text: `${id} : pwshPath = ${pwshPath} (not a usable PowerShell 7: ${check.reason})` })
  }
  return rows
}
