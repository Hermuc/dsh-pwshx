/**
 * runtime/probe.js —— 探测原语：把「这条路径是不是 PowerShell 7」变成可判定的布尔值。
 */

import { lstatSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { EXECUTION_ALIAS, MINIMUM_MAJOR, PROBE_MAX_BYTES, PROBE_GRACE_MS, STORE_VERSIONED, WINDOWS_POWERSHELL_51, WINDOWS_POWERSHELL_51_VERSION } from "./constants.js";
import { describe } from "./util.js";

/**
 * One reading cycle's probe memo. `overridePath`, an executor row and `ctx.shell.pwshPath`
 * routinely name the same executable, and each reading used to probe it independently — one
 * `pwsh7_status` call started three identical `pwsh -EncodedCommand` processes for one answer.
 *
 * The scope is deliberately **one cycle**, never a TTL: a reading cycle is the window in which
 * "what will run" cannot have changed underneath the report, so sharing inside it cannot go stale.
 * Anything longer (a timed cache) would hand a just-installed runtime's predecessor back to the
 * gate, which is exactly the failure the 60-second gate refresh exists to close.
 * @returns a fresh memo, keyed by the executable path.
 */
export function createProbeCache() {
  return new Map()
}

/**
 * Probe one executable, unconditionally.
 * @param ctx - the row's Host context.
 * @param executable - the executable to probe.
 * @returns the reported version, or `undefined` when it could not be established.
 */
export async function probeVersionUncached(ctx, executable) {
  // `-EncodedCommand` sidesteps Windows argument quoting entirely.
  const encoded = Buffer.from('$PSVersionTable.PSVersion.ToString()', 'utf16le').toString('base64')

  let handle
  try {
    handle = ctx.subprocess.spawn({
      argv: [executable, '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      cwd: process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: PROBE_MAX_BYTES },
        stderr: { maxBytes: PROBE_MAX_BYTES },
      },
      graceMs: PROBE_GRACE_MS,
    })
  } catch (error) {
    ctx.logger?.warn?.('dsh-pwshx: could not start %s: %s', executable, describe(error))
    return undefined
  }

  try {
    const outcome = await handle.done
    if (outcome.exitCode !== 0) return undefined
    const text = handle.collected.stdout?.readFrom(0).text ?? ''
    // The probe prints exactly one line, but a preview build answers with a suffix
    // (`7.4.0-preview.1`) and a shell that prints a banner or a warning first would defeat a
    // whole-output match — which then reported a *working* pwsh as "did not report a version".
    // Take the first line that is a version and nothing else.
    return /^\s*(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.]+)?)\s*$/mu.exec(text)?.[1]
  } catch (error) {
    handle.terminate()
    ctx.logger?.warn?.('dsh-pwshx: probing %s failed: %s', executable, describe(error))
    return undefined
  }
}

/**
 * Ask one executable for its PowerShell version string, once per reading cycle.
 * @param ctx - the row's Host context.
 * @param executable - the executable to probe.
 * @param cache - the cycle's probe memo; omitted means "no sharing".
 * @returns the reported version (for example `7.6.6`), or `undefined` when it could not be established.
 */
export async function probeVersion(ctx, executable, cache) {
  if (cache === undefined) return await probeVersionUncached(ctx, executable)
  // Windows paths are case-insensitive, and the same file arrives spelled differently from a row
  // patch (`C:\Tools\pwsh.exe`) and from the executor getter.
  const key = String(executable).toLowerCase()
  let pending = cache.get(key)
  if (pending === undefined) {
    // The promise is memoized, not the value: two readers that start before the first probe
    // answers share it instead of racing two processes.
    pending = probeVersionUncached(ctx, executable)
    cache.set(key, pending)
  }
  return await pending
}

/**
 * Whether a path can be a spawn target at all, following the executor's own acceptance: a file
 * or a reparse point (a Store execution alias is a zero-length reparse point, which is exactly
 * why the *pin* policy is separate from the *spawn* test).
 * @param candidate - the path to test.
 * @returns whether the executor could spawn it.
 */
export function isSpawnable(candidate) {
  try {
    const stats = lstatSync(candidate)
    return stats.isFile() || stats.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * The package family name inside a version-numbered Store directory name:
 * `Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe` → `Microsoft.PowerShell_8wekyb3d8bbwe`.
 * @param directory - the directory name right under `WindowsApps`.
 * @returns the family name, or `undefined` when the name is not version-numbered.
 */
export function packageFamilyOf(directory) {
  const parts = directory.split('_')
  return parts.length >= 3 ? `${parts[0]}_${parts.at(-1)}` : undefined
}

/**
 * The version-stable alias of a version-numbered Store path, when Windows has published one:
 * `%LOCALAPPDATA%\Microsoft\WindowsApps\<package family>\pwsh.exe`.
 *
 * The upstream resolver never returns this form — MSIX activation puts the version-numbered
 * directory at the head of `PATH` — yet it is the only Store path worth pinning, so the
 * auto-probe looks for it explicitly.
 * @param candidate - a version-numbered Store path.
 * @returns the family alias, or `undefined` when there is none.
 */
export function familyAliasOf(candidate) {
  const family = packageFamilyOf(basename(dirname(candidate)))
  if (family === undefined) return undefined
  const alias = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps', family, 'pwsh.exe')
  return isSpawnable(alias) ? alias : undefined
}

/** Whether a path lives under a Microsoft Store install location. */
export function originOf(candidate) {
  if (!EXECUTION_ALIAS.test(candidate)) return 'ordinary'
  return STORE_VERSIONED.test(candidate) ? 'store-package' : 'store-alias'
}

/**
 * Whether a candidate is acceptable wiring — either one this plugin would suggest in a patch,
 * or one it treats as already in place.
 *
 * An ordinary file qualifies, and so does the Store family alias: its path carries no version,
 * so Store updates do not move it, and its confinement was verified on a Windows machine
 * running the alias (an out-of-workspace write under a confined policy is still refused). A
 * version-numbered Store path is deliberately excluded — it moves on every update.
 * @param origin - an {@link originOf} result.
 * @returns whether the candidate may be pinned and counts as in place.
 */
export function inPlace(origin) {
  return origin === 'ordinary' || origin === 'store-alias'
}

/** Human label for a usable candidate. */
export function labelOf(candidate) {
  if (candidate.origin === 'store-alias') return 'Store family alias'
  if (candidate.origin === 'store-package') return 'version-numbered Store path'
  return 'ordinary file'
}

/**
 * The warning for a path that runs but must never be pinned — a version-numbered Store path
 * moves on the next Store update — or `undefined` when there is nothing to warn about.
 * @param candidate - a validation outcome.
 * @returns the warning line, or `undefined`.
 */
export function unpinnableWarning(candidate) {
  return candidate?.usable === true && candidate.origin === 'store-package'
    ? 'That path runs, but do not pin it: a version-numbered Store path moves on every update.'
    : undefined
}

/**
 * Validate one candidate executable: it must exist and be spawnable (a file or a Store
 * execution alias), and report PowerShell ≥ 7. Store sources are labeled by form, and the
 * version-numbered one is never recommended — see {@link inPlace}.
 * @param ctx - the row's Host context.
 * @param candidate - the path to validate.
 * @param cache - the reading cycle's probe memo.
 * @returns the validation outcome.
 */
export async function validateCandidate(ctx, candidate, cache) {
  if (candidate === undefined) {
    return { usable: false, reason: 'no PowerShell 7 installation was found' }
  }
  if (WINDOWS_POWERSHELL_51.test(candidate)) {
    return { usable: false, path: candidate, reason: 'only Windows PowerShell 5.1 is available' }
  }
  if (!isSpawnable(candidate)) {
    return {
      usable: false,
      path: candidate,
      origin: originOf(candidate),
      reason: `${candidate} does not exist, so it cannot be a spawn target`,
    }
  }

  return await probeAndVersion(ctx, candidate, cache)
}

/**
 * Validate a path the way the executor itself accepts candidates — file or reparse point,
 * probed for a reported version. Used for executor rows, whose paths already run today; what
 * this plugin is willing to *pin* is a separate judgement ({@link inPlace}).
 * @param ctx - the row's Host context.
 * @param candidate - the executor row's `pwshPath`.
 * @param cache - the reading cycle's probe memo.
 * @returns the validation outcome.
 */
export async function validateRowPath(ctx, candidate, cache) {
  if (!isSpawnable(candidate)) {
    return { usable: false, path: candidate, origin: originOf(candidate), reason: `${candidate} does not exist` }
  }
  return await probeAndVersion(ctx, candidate, cache)
}

/**
 * Probe one path that already exists and check its major version. Shared by both
 * validators; the origin label follows the path, not the acceptance criteria.
 * @param ctx - the row's Host context.
 * @param candidate - the path to probe.
 * @param cache - the reading cycle's probe memo.
 * @returns the validation outcome.
 */
export async function probeAndVersion(ctx, candidate, cache) {
  const version = await probeVersion(ctx, candidate, cache)
  if (version === undefined) {
    return { usable: false, path: candidate, origin: originOf(candidate), reason: `${candidate} did not report a PowerShell version` }
  }
  const major = Number.parseInt(version.split('.')[0] ?? '', 10)
  if (!Number.isSafeInteger(major) || major < MINIMUM_MAJOR) {
    // The version still travels: a row may pin Windows PowerShell 5.1, and what that row
    // actually runs is a fact the model has to be told even though this plugin would never
    // recommend the path.
    return { usable: false, path: candidate, version, origin: originOf(candidate), reason: `${candidate} reported PowerShell ${version}, below the supported ${MINIMUM_MAJOR}` }
  }
  return { usable: true, path: candidate, version, origin: originOf(candidate) }
}

/**
 * The PowerShell the `pwsh` tool itself runs, following the executor's own precedence: a row
 * that pins `pwshPath` decides, otherwise the executor's probe does. A pinned path that
 * reports no version at all is an unknown runtime, not a guess.
 * @param rows - the probed executor rows.
 * @param status - the detection result, for the unpinned case.
 * @returns the version string, or `undefined` when it cannot be established.
 */
export function effectiveRuntime(rows, status) {
  // A disabled row does not run, so it must not be the answer to "which runtime is this?" — and
  // when several rows pin a path the first one is still the best available answer, which the report
  // says out loud rather than implying it is the only pin.
  const pinned = rows.find((row) => row.pwshPath !== undefined
    && row.disabled !== true && row.options?.disabled !== true)
  if (pinned !== undefined) return pinned.probed
  const auto = status.auto
  if (auto === undefined) return undefined
  if (auto.usable === true) return auto.version
  // With no PowerShell 7 anywhere, the executor's own last candidate is Windows PowerShell
  // 5.1 — the case where the warning matters most. `validateCandidate` refuses to recommend
  // that path (and so reports no version), but the `pwsh` tool still runs it.
  return WINDOWS_POWERSHELL_51.test(auto.path ?? '') ? WINDOWS_POWERSHELL_51_VERSION : undefined
}
