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

test("registerTool retries with a permissive schema after a rejection", () => {
  const calls = [];
  const { ctx, warnings } = baseCtx({
    register: (tool) => {
      calls.push(tool);
      if (calls.length === 1) throw new Error("JsonSchemaError: unsupported");
    },
  });
  assert.doesNotThrow(() => registerTool(ctx, normalizeConfig({})));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].parameters.additionalProperties, true);
  assert.equal(calls[1].output.schema.additionalProperties, true);
  assert.equal(typeof calls[1].output.render, "function");
  assert.equal(warnings.length, 1);
});

test("registerTool swallows a permanent registration failure without throwing", () => {
  const { ctx, errors } = baseCtx({ register: () => { throw new Error("boom"); } });
  assert.doesNotThrow(() => registerTool(ctx, normalizeConfig({})));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /pwsh_safe registration failed/);
});

test("registerTool registers pwsh_safe with the full schema on the happy path", () => {
  const registered = [];
  const { ctx, errors, warnings } = baseCtx({ register: (tool) => { registered.push(tool); } });
  registerTool(ctx, normalizeConfig({}));
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, "pwsh_safe");
  assert.equal(registered[0].parameters.type, "object");
  assert.equal(typeof registered[0].parameters.properties, "object");
  assert.equal(typeof registered[0].execute, "function");
});
