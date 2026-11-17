import { test } from "node:test";
import assert from "node:assert/strict";
import { reportOutput } from "../lib/runtime/status.js";

test("reportOutput: schema declares one required report string", () => {
  const out = reportOutput();
  assert.equal(out.schema.type, "object");
  assert.equal(out.schema.additionalProperties, false);
  assert.deepEqual(out.schema.properties.report, { type: "string", required: true });
});

test("reportOutput: render turns the report into one text block", () => {
  const out = reportOutput();
  assert.deepEqual(out.render({}, { report: "hello" }), [{ type: "text", text: "hello" }]);
});
