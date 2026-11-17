/**
 * 工具注册：systemPrompt 段 + pwsh_safe 工具。
 * 只做「挂到 ctx 上」的适配，具体逻辑在 pipeline.js。
 */
import { PROMPT_SECTION_NAME, promptText } from "../core/prompt.js";
import { renderResult } from "../dsh/render.js";
import { OUTPUT_SCHEMA, PARAMETERS, SANDBOX_PARAMETERS, toolDescription } from "./schema.js";
import { escalationModes } from "../dsh/sandbox.js";
import { executePipeline } from "./pipeline.js";

/**
 * 可选注入 systemPrompt：headless 极简宿主没有该服务时插件仍要能加载。
 * @param {any} ctx
 */
export function registerPromptSection(ctx) {
  if (typeof ctx.inject !== "function") return;
  ctx.inject(["systemPrompt"], (scoped) => {
    try {
      scoped.systemPrompt.section({
        name: PROMPT_SECTION_NAME,
        order:
          typeof scoped.systemPrompt.getSectionOrder === "function"
            ? scoped.systemPrompt.getSectionOrder("TOOL_PWSH")
            : 200,
        text: promptText(),
      });
    } catch (error) {
      ctx.logger?.warn?.("pwsh-safe-plus: could not register the prompt section: " + String(error));
    }
  });
}

/**
 * 注册 pwsh_safe 工具。
 * @param {any} ctx
 * @param {import("../config.js").PluginConfig} config
 */
export function registerTool(ctx, config) {
  // Advertise sandbox escalation only when a confining executor is mounted, exactly like
  // the official pwsh tool: an unadvertised key still reaches execute, so hiding it keeps
  // headless compositions from offering a parameter that cannot work.
  const parameters = { ...PARAMETERS, properties: { ...PARAMETERS.properties } };
  if (escalationModes(ctx).length > 0) Object.assign(parameters.properties, SANDBOX_PARAMETERS);
  ctx.tools.register({
    name: "pwsh_safe",
    description: toolDescription(),
    parameters,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({
      card: "generic",
      title: (args?.description || "pwsh_safe").slice(0, 80),
      kind: "execute",
      rawInput: args,
    }),
    execute: (args, exec) => executePipeline(ctx, args, exec, config),
  });
}
