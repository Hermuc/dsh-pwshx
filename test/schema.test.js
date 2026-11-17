import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSupportedJsonSchema } from "@deepseek-ai/dsh-tools";
import { OUTPUT_SCHEMA, PARAMETERS, SANDBOX_PARAMETERS } from "../lib/tool/schema.js";

test("OUTPUT_SCHEMA is a supported JSON schema", () => {
  assertSupportedJsonSchema(OUTPUT_SCHEMA);
});

test("OUTPUT_SCHEMA covers foreground and background unions", () => {
  assert.ok(Array.isArray(OUTPUT_SCHEMA.oneOf));
  assert.equal(OUTPUT_SCHEMA.oneOf.length, 2);
});

test("SANDBOX_PARAMETERS defines sandbox_permissions and justification", () => {
  assert.equal(SANDBOX_PARAMETERS.sandbox_permissions.type, "string");
  assert.equal(SANDBOX_PARAMETERS.justification.type, "string");
});
