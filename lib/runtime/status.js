/**
 * runtime/status.js —— 状态报告：给工具、插件页和激活扫描共用的一份真相。
 */

import { DISABLE_PATH, MANUAL_STORE_STEPS, MINIMUM_MAJOR, SOURCE_ROW_ID } from "./constants.js";
import { detect, executorRows } from "./detect.js";
import { gateFromReading, refreshExecutorPath, shellRuntimeReading } from "./version-guard.js";
import { hintFor, runtimeNoteFor } from "./note.js";
import { createProbeCache, effectiveRuntime, inPlace, labelOf, unpinnableWarning, validateCandidate } from "./probe.js";
import { runtimeState } from "./state.js";
import { majorOf } from "./util.js";
import { resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local';

/**
 * The output contract both tools share: the report is the whole payload, so the registry's
 * success path (`execute` → validate → `render`) turns it into one text block.
 *
 * `render` is not optional. `defineTool` installs its own wrapper that calls this function,
 * so a definition without one registers normally and then fails on **every** call with
 * `output.render failed: userRender is not a function`.
 * @returns a fresh output contract for one tool definition.
 */
export function reportOutput() {
  return {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { report: { type: 'string', required: true } },
    },
    render: (_args, value) => [{ type: 'text', text: value.report }],
  }
}

/**
 * Build the human-readable report: the requested path check (when asked), the configured
 * override, what the executor rows run today, and the recommendation — a patch for an
 * ordinary-file PowerShell 7, or the Microsoft Store install path for a Store-only machine.
 * @param ctx - the row's Host context.
 * @param config - the resolved row configuration.
 * @param options - `explicitPath` (tool argument), `status` (precomputed detection).
 * @returns the report text.
 */
export async function renderStatus(ctx, config, options = {}) {
  // A caller that already probed (the tool's `detect` before `renderStatus`) hands its memo in, so
  // the report reuses those answers instead of starting the same executables again.
  const cache = options.cache ?? createProbeCache()
  const status = options.status ?? await detect(ctx, config, cache)
  const explicit = options.explicitPath === undefined
    ? undefined
    : await validateCandidate(ctx, options.explicitPath, cache)
  const rows = await executorRows(ctx, cache)
  let shellReading = await shellRuntimeReading(ctx, cache)
  if (shellReading?.version !== undefined && (majorOf(shellReading.version) ?? 0) < MINIMUM_MAJOR) {
    const refreshed = await refreshExecutorPath(ctx, cache)
    if (refreshed !== undefined) shellReading = await shellRuntimeReading(ctx, cache)
  }
  const liveStale = shellReading !== undefined
    && shellReading.version !== undefined
    && (majorOf(shellReading.version) ?? 0) < MINIMUM_MAJOR

  // Every caller of this function (activation sweep, both tools, the page's Re-detect)
  // refreshes the prompt section and the gate from the same reading as the report.
  const state = runtimeState(ctx)
  state.gate = gateFromReading(shellReading, rows, status)
  state.runtimeNote = shellReading?.version !== undefined
    ? hintFor(shellReading.version)
    : runtimeNoteFor(rows, status)

  const lines = []

  if (explicit !== undefined) {
    lines.push(explicit.usable
      ? `Requested path: PowerShell ${explicit.version} (${labelOf(explicit)})\n  ${explicit.path}`
      : `Requested path rejected: ${explicit.reason}`)
    const warning = unpinnableWarning(explicit)
    if (warning !== undefined) lines.push(warning)
    lines.push('')
  }

  if (status.override !== undefined) {
    lines.push(status.override.usable
      ? `overridePath accepted: PowerShell ${status.override.version} (${status.override.path})`
      : `overridePath rejected: ${status.override.reason}`)
    const warning = unpinnableWarning(status.override)
    if (warning !== undefined) lines.push(warning)
    lines.push('')
  }

  lines.push('Executor rows:')
  for (const row of rows) lines.push(`  ${row.text}`)
  lines.push('')

  const enabled = rows.filter((row) => row.disabled !== true && row.options?.disabled !== true)
  const shellVersion = shellReading?.version
  const shellMajor = shellVersion === undefined ? undefined : Number.parseInt(shellVersion.split('.')[0] ?? '', 10)
  const shellEffective = shellMajor !== undefined && shellMajor >= MINIMUM_MAJOR
    ? { id: 'ctx.shell', version: shellVersion, origin: shellReading.origin, path: shellReading.path, source: shellReading.source }
    : undefined
  // A shell that exists but could not report a version is an unknown runtime, not a licence to
  // fall back to a row reading that may disagree with what the tool will spawn.
  const shellUnknown = shellReading !== undefined && shellReading.version === undefined
  const effective = shellEffective ?? (shellUnknown ? undefined : enabled.find((row) => row.version !== undefined))
  if (effective !== undefined) {
    if (shellEffective !== undefined) {
      lines.push(`pwsh_safe currently runs on PowerShell ${effective.version} via the executor (${effective.path}).`)
      if (effective.origin === 'store-alias') {
        lines.push('The executor resolves to the version-stable Store family alias: its directory carries no version,')
        lines.push('so Store updates do not move it, and the ACL sandbox still confines what it runs. Nothing to configure.')
        lines.push('Caveat: Windows resolves the alias through AppInfo package activation, which is undocumented —')
        lines.push('if a future Windows or Store change stops it, run pwsh7_install, or pin an ordinary pwsh.exe.')
      } else if (effective.origin === 'store-package') {
        lines.push('The executor resolves to a version-numbered Store path, which moves on every Store update.')
        lines.push('Repin the version-stable family alias, or run pwsh7_install for a Store-managed PowerShell.')
      } else {
        lines.push('That is the path the executor already resolves; Nothing to configure.')
      }
      return lines.join('\n')
    }
    lines.push(`pwsh_safe currently runs on PowerShell ${effective.version} via row ${effective.id}.`)
    const others = enabled.filter((row) => row !== effective && row.version !== undefined)
    if (others.length > 0) {
      lines.push(`Other enabled rows (${others.map((row) => row.id).join(', ')}) also report a runtime; this reading follows the row order above.`)
    }
    if (effective.origin === 'store-alias') {
      lines.push('That pin is the version-stable Store family alias: its directory carries no version, so Store')
      lines.push('updates do not move it, and the ACL sandbox still confines what it runs. Nothing to configure.')
      lines.push('Caveat: Windows resolves the alias through AppInfo package activation, which is undocumented —')
      lines.push('if a future Windows or Store change stops it, run pwsh7_install, or pin an ordinary pwsh.exe.')
    } else if (effective.origin === 'store-package') {
      lines.push('That pin is a version-numbered Store path, which moves on every Store update: the pin will')
      lines.push('silently stop working. Repin the version-stable family alias, or run pwsh7_install for a')
      lines.push('Store-managed PowerShell and drop this patch entry afterwards.')
    }
    return lines.join('\n')
  }

  const target = [explicit, status.override, status.auto]
    .find((candidate) => candidate?.usable === true && inPlace(candidate.origin))

  if (target !== undefined) {
    if (!liveStale && rows.every((row) => row.pwshPath === undefined) && resolvePwshPath(undefined, process.env, 'win32') === target.path) {
      lines.push(`PowerShell ${target.version} is in place at ${target.path}, and no executor row pins a path —`)
      lines.push('pwsh_safe picks it up natively. Nothing to configure.')
      return lines.join('\n')
    }
    const sourceRow = rows.find((row) => row.id === SOURCE_ROW_ID)
    const currentConfig = sourceRow?.config ?? {}
    const patchConfig = { ...currentConfig, pwshPath: target.path }
    const action = sourceRow === undefined ? 'add' : 'update'
    if (liveStale) {
      lines.push(`The running executor still resolves to Windows PowerShell ${shellReading.version} (${shellReading.path});`)
      lines.push(`PowerShell ${target.version} is available at ${target.path}. A running executor only re-resolves when`)
      lines.push('its declared pwshPath changes, so pin it in the profile patch and reload DSH:')
    } else {
      lines.push(`To make pwsh_safe use PowerShell ${target.version} (${target.path}), ${action} this in the profile patch`)
      lines.push('(~/.dsh/profiles/<profile>/cordis.patch.yml) and restart DSH:')
    }
    lines.push('')
    lines.push(`- id: ${SOURCE_ROW_ID}`)
    lines.push('  config:')
    for (const [key, value] of Object.entries(patchConfig)) {
      if (value === undefined) continue
      lines.push(`    ${key}: ${key === 'pwshPath' ? `'${value}'` : JSON.stringify(value)}`)
    }
    if (Object.keys(currentConfig).some((key) => key !== 'pwshPath')) {
      lines.push('')
      lines.push('The `config` block replaces that row\'s config wholesale; the fields above are the ones')
      lines.push('the row currently carries, plus pwshPath.')
    } else if (sourceRow !== undefined) {
      lines.push('')
      lines.push('The `config` block replaces that row\'s config wholesale; keep any other fields it has.')
    }
    if (status.override?.usable === true && target === status.override) {
      lines.push('')
      lines.push('overridePath is only what this plugin probes and recommends; pwsh_safe does not read it.')
      lines.push('The patch above is what wires the executor.')
    }
    if (target.origin === 'store-alias') {
      lines.push('')
      lines.push('That path is the version-stable Store family alias — pinning it is what keeps Store updates')
      lines.push('from moving it. Prefer an ordinary pwsh.exe when the machine has one.')
    }
    return lines.join('\n')
  }

  const store = [status.override, status.auto].find((candidate) => candidate?.usable === true)
  if (store !== undefined) {
    // Only a version-numbered Store path can reach this branch: the family alias is acceptable
    // and would have matched above. This is the shape that breaks on the next Store update.
    lines.push(`PowerShell ${store.version} was found at a version-numbered Store path (${store.path}).`)
    lines.push('This plugin never pins that path — the next Store update moves it — and no version-stable')
    lines.push('Store alias or ordinary pwsh.exe was found.')
  } else {
    lines.push(`PowerShell 7: not usable — ${status.auto?.reason ?? 'no candidate was found'}.`)
  }
  lines.push('Three ways forward:')
  lines.push('  1. Install PowerShell 7 from the Microsoft Store — ask for pwsh7_install (this plugin opens the')
  lines.push('     Store page and clicks Install); or choose the manual path below.')
  lines.push(`     Manual install: ${MANUAL_STORE_STEPS}.`)
  lines.push('     A Microsoft Store window will open and must stay open while the script clicks Install;')
  lines.push('     a manual Store install is detected automatically, with no pwshPath pin needed.')
  lines.push('  2. If PowerShell 7 is already installed elsewhere, configure the executor: call pwsh7_status')
  lines.push('     with that path for the exact pwsh-sandbox.pwshPath patch, then reload DSH.')
  for (const line of DISABLE_PATH) lines.push(line === DISABLE_PATH[0] ? `  3. ${line}` : `     ${line}`)
  return lines.join('\n')
}
