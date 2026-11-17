import { test } from "node:test";
import assert from "node:assert/strict";
import { registerTool } from "../lib/tool/register.js";
import { normalizeConfig } from "../lib/config.js";

function baseCtx(tools) {
  const errors = [];
  const warnings = [];
  return {
    ctx: { tools, logger: { error: (m) => errors.push(m), warn: (m) => warnings.push(m) } },
    errors,
    warnings,
  };
}

test("registerTool swallows a throwing ctx.tools.register instead of failing the plugin", () => {
  const { ctx, errors } = baseCtx({ register: () => { throw new Error("boom"); } });
  assert.doesNotThrow(() => registerTool(ctx, normalizeConfig({})));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /pwsh_safe registration failed/);
});

test("registerTool registers pwsh_safe with a valid schema", () => {
  const registered = [];
  const { ctx, errors } = baseCtx({ register: (tool) => { registered.push(tool); } });
  registerTool(ctx, normalizeConfig({}));
  assert.equal(errors.length, 0);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, "pwsh_safe");
  assert.equal(typeof registered[0].execute, "function");
});
