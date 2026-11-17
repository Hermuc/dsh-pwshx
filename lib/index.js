/**
 * dsh-pwshx —— 单一 PowerShell 执行路径 + PowerShell 7 运行时保障。
 *
 * 模块边界（按职责分层，index 只做编排）：
 *  - core/     纯函数：修复 / 检查 / 编码 / here-string / 规则
 *  - dsh/      DSH 适配：ctx.shell / 结果渲染
 *  - tool/     工具层：pwsh_safe 的 schema / pipeline / register
 *  - runtime/  PowerShell 7 运行时：检测、gate、UTF-8 代码页、状态/安装工具
 *  - bridge/   过渡性 UTF-8 console bridge（独立可删）
 *
 * 执行流水线：明文 → fix → check → gate → base64 → ctx.shell.execute()
 */

import z from "@deepseek-ai/schemastery";
import { normalizeConfig } from "./config.js";
import { registerPromptSection, registerTool } from "./tool/register.js";
import { applyRuntime } from "./runtime/index.js";

export const name = "dsh-pwshx";
export const inject = ["tools", "shell", "shellEnv", "subprocess", "configEditor", "systemPrompt"];

export const Config = z.object({
  fixLevel: z.union(["safe", "full", "off"]).default("safe").volatile(),
  checkMode: z.union(["block", "warn", "off"]).default("block").volatile(),
  shell: z.union(["auto", "pwsh", "powershell51"]).default("pwsh").volatile(),
  timeoutMs: z.number().default(120000).volatile(),
  maxEncodedChars: z.number().default(24000).volatile(),
  overridePath: z.string().default("").volatile(),
  utf8Console: z.boolean().default(true).volatile(),
});

/**
 * @param {any} ctx
 * @param {Partial<import("./config.js").PluginConfig>} [rawConfig]
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  // 1) pwsh_safe 工具 + 自己的提示段。两步各自隔离：任何一步失败都只是少一个能力，
  //    不能让异常冒泡成"插件加载失败"——那会把唯一的 PowerShell 工具也带走。
  try {
    registerPromptSection(ctx);
  } catch (error) {
    ctx.logger?.warn?.("dsh-pwshx: prompt section failed: " + String(error));
  }
  try {
    registerTool(ctx, config);
  } catch (error) {
    ctx.logger?.error?.("dsh-pwshx: pwsh_safe registration failed: " + String(error));
  }
  // 2) PowerShell 7 运行时保障：检测、gate、UTF-8 代码页、pwsh7_status / pwsh7_install。
  //    只在具备 DSH 运行时服务的宿主上启用；极简宿主/单测缺少 effect 时仍保留 pwsh_safe。
  if (typeof ctx.effect === "function") {
    try {
      applyRuntime(ctx, config);
    } catch (error) {
      ctx.logger?.warn?.("dsh-pwshx: runtime layer disabled: " + String(error));
    }
  }
}
