/**
 * runtime/state.js —— 每个 Host 上下文的运行时状态与行配置快照。
 */

import { MANUAL_STORE_STEPS } from "./constants.js";
import { isSet } from "./util.js";

/**
 * One line about the PowerShell `pwsh` actually runs — the fact the model needs *before* it
 * writes a pipeline, since `&&` is valid in PowerShell 7 and a parse error in 5.1.
 *
 * Written by {@link renderStatus} (the activation sweep, every tool call, and the plugin
 * page's Re-detect all pass through it) and read by the section thunk at assembly time, so
 * it follows a configuration change without a restart. Empty until a runtime is known.
 */
/**
 * Module-level by design: this plugin is one executor row in one host process, and the tools read
 * what the last `apply` recorded. Two applications in one process — a second row, or a hot reload —
 * would share this state and the newest one wins; moving it into the apply scope is the fix if that
 * ever becomes a real deployment. Recorded as backlog rather than refactored blind before a release.
 */
/**
 * Per-application runtime state, keyed by the Host context. The gate used to be module-level,
 * which was only true while one row existed in one process; the host gate applies several
 * fixtures in one process, and a second row or a hot reload has the same shape. Keeping the
 * reading beside the context is the smallest fix that makes the guard read its own application.
 */
export const runtimeStates = new WeakMap()

/**
 * The runtime state for one row, created on first use.
 * @param ctx - the row's Host context.
 * @returns its gate snapshot and prompt note.
 */
export function runtimeState(ctx) {
  let state = runtimeStates.get(ctx)
  if (state === undefined) {
    state = {
      gate: {
        state: 'unknown',
        version: undefined,
        path: undefined,
        source: 'unknown',
        reasonCode: 'detecting',
        at: 0,
      },
      runtimeNote: '',
      refreshing: null,
      installFailures: 0,
    }
    runtimeStates.set(ctx, state)
  }
  return state
}

/**
 * Merge the row's current configuration over the captured activation defaults. The
 * configure card writes through configForms (a volatile write), so the row entry's config
 * is the live truth; the captured config only supplies the schema defaults.
 * @param ctx - the row's Host context.
 * @param fallback - the config captured at activation.
 * @returns the merged configuration.
 */
export function readRowConfig(ctx, fallback) {
  const merged = {
    overridePath: typeof fallback?.overridePath === 'string' ? fallback.overridePath : undefined,
    utf8Console: fallback?.utf8Console !== false,
  }
  try {
    const entry = ctx.configEditor.entries().find((candidate) => candidate?.options?.name === 'dsh-pwshx')
    const values = entry?.options?.config
    if (isSet(values?.overridePath)) merged.overridePath = String(values.overridePath)
    if (values?.utf8Console !== undefined) merged.utf8Console = values.utf8Console !== false
  } catch { /* fall back to the captured config */ }
  return merged
}

/** Reset the consecutive script-install failure counter (success, or an explicit user retry). */
export function resetInstallFailures(ctx) {
  runtimeState(ctx).installFailures = 0
}

/** Count one failed script install. Started-but-not-installed does not count. */
export function recordInstallFailure(ctx) {
  const state = runtimeState(ctx)
  state.installFailures = Math.min(99, (state.installFailures ?? 0) + 1)
}

/** The stop text after 3 consecutive script-install failures. */
export function circuitBreakerReport() {
  return [
    'Install not started: 3 consecutive script installs have failed. Stop retrying and stop asking the same question.',
    'First ask the user: is a VPN active? If yes, ask them to disconnect it, fully quit and restart Microsoft Store.',
    'Ask them to check the network — especially the VPN — and reply explicitly when it is fixed.',
    'Only after that explicit reply, call pwsh7_install with userConfirmedFixed: true and vpnOffConfirmed: true. Do not pass userConfirmedFixed on a guess or an unconfirmed claim.',
    `Manual install: ${MANUAL_STORE_STEPS}. A manual Store install is detected automatically; no pwshPath pin is needed.`,
  ].join(' ')
}

/** The row's live context for the dispatch service; refreshed on every activation. */
let hostContext = null;

/** Record the active row context for the dispatch service. */
export function setHostContext(ctx) {
  hostContext = ctx;
}

/** The active row context, or null before the first activation. */
export function getHostContext() {
  return hostContext;
}
