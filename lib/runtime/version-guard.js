/**
 * runtime/gate.js —— 版本闸：PowerShell 7 不可用时拦住 pwsh / pwsh_safe。
 */

import { resolvePwshPath } from "@deepseek-ai/dsh-pwsh-local";
import { GATE_TTL_MS, MANUAL_STORE_STEPS, MINIMUM_MAJOR } from "./constants.js";
import { detect, executorRows } from "./detect.js";
import { hintFor, runtimeNoteFor } from "./note.js";
import { createProbeCache, effectiveRuntime, inPlace, isSpawnable, originOf, probeVersion } from "./probe.js";
import { runtimeState } from "./state.js";
import { describe, isSet, majorOf } from "./util.js";

/**
 * Read the executable the `pwsh` tool will actually spawn, from the executor itself.
 *
 * `dsh-tool-pwsh` executes through `ctx.shell`; `PwshLocalExecutor.argv()` prefixes every command
 * with `this.pwshPath`, and that getter re-resolves when the declared config changes. It is the
 * authoritative "what will run" fact — more reliable than rebuilding the answer from
 * `configEditor.entries()`, which only exposes `include`-owned rows (a Desktop-generated live row
 * may not be addressable).
 *
 * `pwshPath` is a `PwshLocalExecutor` getter, not part of the `ShellExecutor` abstract seam, so the
 * read is feature-detected and falls back to the concrete config + resolver. When no shell service
 * is composed the caller keeps the legacy row-based reading.
 * @param ctx - the row's Host context.
 * @param cache - the reading cycle's probe memo.
 * @returns `{ path, version, origin, source }`, or `undefined` when there is no shell service.
 */
export async function shellRuntimeReading(ctx, cache) {
  const shell = ctx.get?.('shell')
  if (shell === undefined || shell === null) return undefined

  let path
  let source
  try {
    if (typeof shell.pwshPath === 'string' && shell.pwshPath.length > 0) {
      path = shell.pwshPath
      source = 'shell'
    } else {
      const declared = shell.config?.pwshPath?.get?.()
      if (isSet(declared)) {
        path = resolvePwshPath(declared, process.env, 'win32')
        source = 'shell-config'
      } else {
        path = resolvePwshPath(undefined, process.env, 'win32')
        source = 'resolver'
      }
    }
  } catch (error) {
    ctx.logger?.warn?.('dsh-pwshx: could not read the executor path: %s', describe(error))
    return { path: undefined, version: undefined, origin: 'ordinary', source: 'shell' }
  }

  if (!isSet(path) || path === 'pwsh') return { path, version: undefined, origin: 'ordinary', source }
  const version = await probeVersion(ctx, path, cache)
  return { path, version, origin: originOf(path), source }
}

/**
 * Force the executor to re-resolve its cached `pwshPath`.
 *
 * `PwshLocalExecutor.pwshPath` only re-resolves when the declared config value changes. An install
 * that lands while the host is running (the normal `pwsh7_install` case) therefore leaves the
 * cached 5.1 path in place, and the tool stays blocked even though the Store package is installed.
 * Writing a value the declared config cannot equal makes that same getter re-run the resolver; it
 * changes no configuration. The cache is a concrete-executor implementation detail, so the read is
 * feature-detected and a composition without it keeps the patch/reload guidance instead.
 * @param ctx - the row's Host context.
 * @param cache - the reading cycle's probe memo. The nudge re-probes the *new* path, which is a
 *   different key, so a stale answer cannot be reused here.
 * @returns the new reading when the nudge produced a usable PowerShell 7, else `undefined`.
 */
export async function refreshExecutorPath(ctx, cache) {
  const shell = ctx.get?.('shell')
  if (shell === undefined || shell === null) return undefined
  let before
  try {
    before = shell.pwshPath
  } catch {
    return undefined
  }
  if (typeof before !== 'string' || before.length === 0) return undefined
  try {
    shell.declaredPwshPath = Symbol('dsh-pwshx-refresh')
    shell.resolvedPwshPath = undefined
  } catch {
    return undefined
  }
  let after
  try {
    after = shell.pwshPath
  } catch {
    return undefined
  }
  if (typeof after !== 'string' || after.length === 0 || after === before) return undefined
  const version = await probeVersion(ctx, after, cache)
  if (version === undefined || (majorOf(version) ?? 0) < MINIMUM_MAJOR) return undefined
  return { before, after, version }
}

/**
 * Turn one reading into the gate snapshot. The executor reading wins when present; the row-based
 * reading is the fallback for compositions without a shell service (and for the existing gate
 * fixtures). A path that exists but reports no version is unknown, not a 5.1 verdict; a pinned path
 * that does not exist is named as such so the report can say "replace or remove it".
 * @param reading - `shellRuntimeReading()`'s result, or `undefined` without a shell.
 * @param rows - the probed executor rows, for the fallback.
 * @param status - the detection result, for the fallback.
 * @returns the gate snapshot.
 */
export function gateFromReading(reading, rows, status) {
  const version = reading?.version ?? effectiveRuntime(rows, status)
  const path = reading?.path
  const source = reading?.source ?? 'rows'
  const at = Date.now()
  const candidate = [status?.override, status?.auto].find((value) => value?.usable === true && inPlace(value.origin))
  const recommended = candidate === undefined
    ? undefined
    : { path: candidate.path, version: candidate.version, origin: candidate.origin }
  // Carry the validator's own words through to the denial text: "file does not exist",
  // "reported no version", "reported 5.1" are different problems and deserve different advice.
  const detail = reading?.reason ?? status?.override?.reason ?? status?.auto?.reason
  const base = { version, path, source, origin: reading?.origin, at, recommended, detail }

  if (version !== undefined && (majorOf(version) ?? 0) >= MINIMUM_MAJOR) {
    return { ...base, state: 'allow', reasonCode: 'ok' }
  }
  if (version !== undefined) {
    return { ...base, state: 'deny', reasonCode: 'windows-powershell' }
  }
  if (path !== undefined && !isSpawnable(path)) {
    return { ...base, state: 'deny', version: undefined, reasonCode: 'broken-pin' }
  }
  if (path !== undefined) {
    return { ...base, state: 'deny', version: undefined, reasonCode: 'unknown' }
  }
  const broken = rows.find((row) => row.pwshPath !== undefined && !isSpawnable(row.pwshPath))
  if (broken !== undefined) {
    return { ...base, state: 'deny', version: undefined, path: broken.pwshPath, source: 'rows', reasonCode: 'broken-pin' }
  }
  return { ...base, state: 'deny', version: undefined, path: undefined, reasonCode: 'no-ps7' }
}

/**
 * Refresh the gate from the executor (or the row fallback), one probe set at a time. This is the
 * only writer besides `renderStatus`, which sets the same snapshot from its own reading.
 * @param ctx - the row's Host context.
 * @param config - the live row configuration.
 * @returns the fresh gate snapshot.
 */
export async function refreshGate(ctx, config) {
  const state = runtimeState(ctx)
  if (state.refreshing !== null) return state.refreshing
  state.refreshing = (async () => {
    try {
      // One probe memo for this refresh: the three readings below name the same executable often
      // enough that an unmemoized cycle started it once per reading.
      const cache = createProbeCache()
      const status = await detect(ctx, config, cache)
      const rows = await executorRows(ctx, cache)
      let reading = await shellRuntimeReading(ctx, cache)
      if (reading?.version !== undefined && (majorOf(reading.version) ?? 0) < MINIMUM_MAJOR) {
        const refreshed = await refreshExecutorPath(ctx, cache)
        if (refreshed !== undefined) reading = await shellRuntimeReading(ctx, cache)
      }
      state.gate = gateFromReading(reading, rows, status)
      state.runtimeNote = state.gate.version !== undefined ? hintFor(state.gate.version) : runtimeNoteFor(rows, status)
      return state.gate
    } catch (error) {
      // A transient probe failure must not turn a working PowerShell 7 into a blocked one:
      // keep the last successful gate, and only fall back to deny when nothing was known yet.
      if (state.gate.state !== 'allow') {
        state.gate = { state: 'deny', version: undefined, path: undefined, source: 'error', reasonCode: 'unknown', at: Date.now(), detail: describe(error) }
      } else {
        state.gate = { ...state.gate, detail: describe(error) }
      }
      ctx.logger?.warn?.('dsh-pwshx: gate refresh failed: %s', describe(error))
      return state.gate
    } finally {
      state.refreshing = null
    }
  })()
  return state.refreshing
}

/**
 * The model-facing reason a `pwsh` call is denied. It is deliberately self-contained: the model
 * must be able to report the state and the three choices without first calling another tool, while
 * `pwsh7_status` remains the place for the exact patch.
 * @param reading - the gate snapshot.
 * @returns the denial reason (the registry wraps it as `Error: <reason>`).
 */
export function denialText(reading) {
  const at = reading.path === undefined ? '' : ` (${reading.path})`
  const configure = 'configure the executor: call pwsh7_status for the exact pwsh-sandbox.pwshPath patch, apply it to the active profile and reload DSH'
  const install = `install PowerShell 7: ask for pwsh7_install after confirming the VPN is off — it opens Microsoft Store and clicks Install — or manually ${MANUAL_STORE_STEPS}`
  const options = `Do not retry. Tell the user to ${configure}; or ${install}; or disable dsh-pwshx.`
  switch (reading.reasonCode) {
    case 'windows-powershell': {
      const available = reading.recommended
      const state = available === undefined
        ? `the pwsh tool would run Windows PowerShell ${reading.version}${at}`
        : `PowerShell ${available.version} is available at ${available.path}, but the executor would run Windows PowerShell ${reading.version}${at}`
      const paths = available === undefined
        ? options
        : `Do not retry. Tell the user to ${configure}; if that is not possible, ${install}; or disable dsh-pwshx.`
      return `dsh-pwshx blocked this call: ${state}. ${paths}`
    }
    case 'broken-pin':
      return `dsh-pwshx blocked this call: the pwsh tool cannot start — the executor pins ${reading.path}, which does not exist. Do not retry. Tell the user to replace or remove that pwshPath (${configure}); or ${install}; or disable this plugin.`
    case 'no-ps7': {
      const detail = reading.detail === undefined ? '' : ` (detail: ${reading.detail})`
      return `dsh-pwshx blocked this call: no PowerShell 7 is installed or detectable${detail}, so the pwsh tool would fall back to Windows PowerShell 5.1. ${options} If PowerShell 7 is installed in a custom location, pass that path to pwsh7_status.`
    }
    case 'detecting':
      return 'dsh-pwshx is still detecting the PowerShell runtime; the call was not executed. Do not retry; call pwsh7_status, then try again.'
    default: {
      const detail = reading.detail === undefined ? '' : ` (detail: ${reading.detail})`
      return `dsh-pwshx blocked this call: the PowerShell runtime could not be determined${at}${detail}. Do not retry; call pwsh7_status to re-detect, then ${configure}, ${install}, or disable this plugin.`
    }
  }
}
