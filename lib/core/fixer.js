/**
 * 修复编排：预处理 → FIX_RULES 按序应用 → WARN_RULES（对**原文**扫描）。
 * 纯函数、可单测、幂等：fix(fix(x).fixed).fixed === fix(x).fixed。
 *
 * 与上游 powershell-fix 的差异（见 NOTICE）：
 *  1. 不探测 PowerShell 引擎（detect.js 已移除 spawnSync）；
 *  2. 新增 level：'safe' 只跑高置信度规则，'full' 跑全部；
 *  3. 返回值带上 level，便于诊断。
 */

import { hostPlatform, resolveShell } from "./detect.js";
import { FIX_RULES, WARN_RULES } from "./rules.js";

/**
 * safe 级别启用的规则：只做「格式/别名/明显 Bash 惯性」的等价改写，
 * 不改变命令语义（不含 rm/sed/chmod/bare-var 这类可能误伤的规则）。
 * @type {ReadonlySet<string>}
 */
export const SAFE_RULE_IDS = new Set([
  "NORM_LINEENDINGS",
  "STRIP_PROMPT",
  "CONT_TRAILING_SPACE",
  "LC_BACKSLASH_TO_BACKTICK",
  "LC_BACKTICK_TO_BACKSLASH",
  "LC_DANGLING_BACKTICK",
  "LC_MISSING_CONT",
  "ENV_EXPORT",
  "ENV_UNSET",
  "ENV_LOCAL_REF",
  "DEV_NULL",
  "LS_FLAGS",
  "MKDIR_P",
  "TOUCH",
  "GREP",
  "WHICH",
  "HEAD_TAIL",
]);

/**
 * @typedef {Object} FixOptions
 * @property {string} [platform]  'win32' 等，默认 hostPlatform()
 * @property {'auto'|'pwsh'|'powershell51'|'bash'} [shell]
 * @property {'safe'|'full'} [level]
 */

/**
 * @typedef {Object} FixResult
 * @property {string} fixed
 * @property {boolean} changed
 * @property {{rule: string, notes: string[]}[]} fixes
 * @property {{rule: string, note: string}[]} warnings
 * @property {string} platform
 * @property {string} shell
 * @property {'safe'|'full'} level
 */

/**
 * @param {string} command
 * @param {FixOptions} [opts]
 * @returns {FixResult}
 */
export function fix(command, opts = {}) {
  const platform = opts.platform ?? hostPlatform();
  const shell = resolveShell(opts.shell, platform);
  const level = opts.level ?? "full";
  const env = { platform, shell };

  let text = command;
  /** @type {{rule: string, notes: string[]}[]} */
  const fixes = [];

  if (text.startsWith("\uFEFF")) {
    text = text.slice(1);
    fixes.push({ rule: "NORM_BOM", notes: ["stripped UTF-8 BOM"] });
  }

  for (const rule of FIX_RULES) {
    if (level === "safe" && !SAFE_RULE_IDS.has(rule.id)) continue;
    if (!rule.applies(env)) continue;
    const res = rule.run(text, env);
    if (res.text !== text) {
      fixes.push({ rule: rule.id, notes: res.notes });
      text = res.text;
    }
  }

  // warn 规则扫描**原始**命令：修复可能已经消除 bash 痕迹，扫修复后的文本会漏报
  /** @type {{rule: string, note: string}[]} */
  const warnings = [];
  for (const rule of WARN_RULES) {
    if (!rule.applies(env)) continue;
    const res = rule.run(command, env);
    for (const note of res.notes) warnings.push({ rule: rule.id, note });
  }

  return { fixed: text, changed: text !== command, fixes, warnings, platform, shell, level };
}
