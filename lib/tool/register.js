/**
 * 工具注册：systemPrompt 段 + pwsh_safe 工具。
 * 只做「挂到 ctx 上」的适配，具体逻辑在 pipeline.js。
 */
import { assertSupportedJsonSchema } from "@deepseek-ai/dsh-tools";
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
 * Verify one schema against the installed Harness's supported JSON-Schema subset.
 * A rejected schema must degrade the tool's metadata, never the plugin: a throwing
 * `ctx.tools.register` would fail `apply` and remove the only PowerShell tool.
 * @param {any} ctx
 * @param {unknown} value schema to check
 * @param {string} label schema name for the log line
 * @returns {boolean} true when the installed Harness accepts it
 */
function schemaAccepted(ctx, value, label) {
  try {
    assertSupportedJsonSchema(value);
    return true;
  } catch (error) {
    ctx.logger?.warn?.("dsh-pwshx: " + label + " rejected by this Harness, using a permissive schema: " + String(error));
    return false;
  }
}

/**
 * 注册 pwsh_safe 工具。任何 schema 或注册失败都降级为日志，绝不让它带走整个插件。
 * @param {any} ctx
 * @param {import("../config.js").PluginConfig} config
 */
export function registerTool(ctx, config) {
  // Advertise sandbox escalation only when a confining executor is mounted, exactly like
  // the official pwsh tool: an unadvertised key still reaches execute, so hiding it keeps
  // headless compositions from offering a parameter that cannot work.
  const parameters = { ...PARAMETERS, properties: { ...PARAMETERS.properties } };
  if (escalationModes(ctx).length > 0) Object.assign(parameters.properties, SANDBOX_PARAMETERS);
  const parametersOk = schemaAccepted(ctx, parameters, "parameters");
  const outputOk = schemaAccepted(ctx, OUTPUT_SCHEMA, "output.schema");
  const tool = {
    name: "pwsh_safe",
    description: toolDescription(),
    parameters: parametersOk ? parameters : { type: "object", additionalProperties: true },
    output: {
      schema: outputOk ? OUTPUT_SCHEMA : { type: "object", additionalProperties: true },
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
  };
  try {
    ctx.tools.register(tool);
  } catch (error) {
    // The last line of defence: a registration failure is a lost feature, not a broken plugin.
    ctx.logger?.error?.("dsh-pwshx: pwsh_safe registration failed: " + String(error));
  }
}
