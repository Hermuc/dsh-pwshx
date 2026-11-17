/**
 * runtime/util.js —— 无依赖的纯工具函数。
 */

/**
 * Render one thrown value as a message.
 * @param error - the thrown value.
 * @returns a human-readable message.
 */
export function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Whether a config value is a non-empty string. */
export function isSet(value) {
  return typeof value === 'string' && value.length > 0
}

/** Collapse a report into one log-friendly line. */
export function flattenReport(report) {
  return report.replace(/\n\s*/gu, ' | ')
}

/** The major version of a probed string, or `undefined` when it is not a version. */
export function majorOf(version) {
  if (version === undefined) return undefined
  const major = Number.parseInt(version.split('.')[0] ?? '', 10)
  return Number.isSafeInteger(major) ? major : undefined
}

/**
 * Read a millisecond override from the environment, refusing anything that is not a finite,
 * non-negative number. A malformed value used to become `NaN`, which `setInterval`/`setTimeout`
 * coerce to 0 — a busy loop that spawns probes back to back. Zero itself is legitimate (it means
 * "as soon as possible", which the gate relies on).
 * @param name - the environment variable name.
 * @param fallback - the value to use when it is absent or unusable.
 * @returns a finite, non-negative number of milliseconds.
 */
export function envMs(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
