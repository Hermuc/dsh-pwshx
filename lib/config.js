/**
 * 插件配置：默认值集中在此，便于维护与文档对齐。
 */

/** @typedef {{fixLevel: 'safe'|'full'|'off', checkMode: 'block'|'warn'|'off', shell: 'auto'|'pwsh'|'powershell51', timeoutMs: number, maxEncodedChars: number, overridePath: string, utf8Console: boolean}} PluginConfig */

/** @type {Readonly<PluginConfig>} */
export const DEFAULT_CONFIG = Object.freeze({
  fixLevel: "safe",
  checkMode: "block",
  shell: "pwsh",
  timeoutMs: 120000,
  maxEncodedChars: 24000,
  overridePath: "",
  utf8Console: true,
});

const FIX_LEVELS = new Set(["safe", "full", "off"]);
const CHECK_MODES = new Set(["block", "warn", "off"]);
const SHELLS = new Set(["auto", "pwsh", "powershell51"]);

/**
 * 归一化外部配置：未知值回落到默认，绝不抛错（配置错误不应让工具消失）。
 * @param {Partial<PluginConfig>|undefined} raw
 * @returns {PluginConfig}
 */
export function normalizeConfig(raw) {
  const r = raw ?? {};
  const timeoutMs = Number.isFinite(r.timeoutMs) && r.timeoutMs > 0 ? Math.floor(r.timeoutMs) : DEFAULT_CONFIG.timeoutMs;
  const maxEncodedChars =
    Number.isFinite(r.maxEncodedChars) && r.maxEncodedChars > 0
      ? Math.floor(r.maxEncodedChars)
      : DEFAULT_CONFIG.maxEncodedChars;
  return {
    fixLevel: FIX_LEVELS.has(r.fixLevel) ? r.fixLevel : DEFAULT_CONFIG.fixLevel,
    checkMode: CHECK_MODES.has(r.checkMode) ? r.checkMode : DEFAULT_CONFIG.checkMode,
    shell: SHELLS.has(r.shell) ? r.shell : DEFAULT_CONFIG.shell,
    timeoutMs,
    maxEncodedChars,
    overridePath: typeof r.overridePath === "string" ? r.overridePath : DEFAULT_CONFIG.overridePath,
    utf8Console: r.utf8Console !== false,
  };
}
