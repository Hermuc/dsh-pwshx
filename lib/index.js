/**
 * dsh-tool-pwsh-safe-plus —— 单一执行路径：语法自动修复 + 转义物理免疫。
 *
 * 设计要点：
 *  - core/ 全是纯函数（可脱离 DSH 单测）；
 *  - dsh/ 只做上下文适配（ctx.shell / render）；
 *  - tool/ 只做工具层（schema / session / pipeline / register）；
 *  - 本文件只做入口编排，不含规则与 IO 细节。
 *
 * 流水线：明文 → fix() → check() → gate() → base64 → ctx.shell.execute()
 */

import { normalizeConfig } from "./config.js";
import { registerPromptSection, registerTool } from "./tool/register.js";

export const name = "tool-pwsh-safe-plus";
export const inject = ["tools", "shell", "shellEnv"];

/**
 * @param {any} ctx
 * @param {Partial<import("./config.js").PluginConfig>} [rawConfig]
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  registerPromptSection(ctx);
  registerTool(ctx, config);
}
