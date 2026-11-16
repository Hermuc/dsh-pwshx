/**
 * 按 PowerShell 版本过滤坑位规则。
 *
 * R3（三元运算符）与 R11（&& / || 链式）属于「PowerShell 5.1 不支持」类规则；
 * 在 pwsh 7 上它们完全合法。若不做过滤，模型写正常的 `a && b` 会被误拒。
 * 这与上游 powershell-fix 的 AND_OR_CHAIN 只在 powershell51 生效是同一口径。
 */

/** @type {ReadonlySet<string>} */
export const PS51_ONLY_RULE_IDS = new Set(["R3", "R11"]);

/**
 * @template {{id: string}} T
 * @param {T[]} hits
 * @param {'auto'|'pwsh'|'powershell51'} shell
 * @returns {T[]}
 */
export function filterChecks(hits, shell) {
  if (shell === "powershell51") return hits;
  return hits.filter((r) => !PS51_ONLY_RULE_IDS.has(r.id));
}
