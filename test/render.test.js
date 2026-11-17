import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResult } from "../lib/dsh/render.js";

test("renderResult: fixedScript block appears before stdout", () => {
  const out = renderResult({ fixedScript: "Get-ChildItem -Force", stdout: { text: "ok" }, stderr: { text: "" } });
  assert.match(out[0].text, /\[fixed script\]\nGet-ChildItem -Force/);
});

test("renderResult: hadErrors warning appears", () => {
  const out = renderResult({ hadErrors: true, exitCode: 0, stdout: { text: "" }, stderr: { text: "boom" } });
  assert.match(out[0].text, /stderr present with exit 0/);
});

test("renderResult: no fixedScript when unchanged", () => {
  const out = renderResult({ stdout: { text: "ok" }, stderr: { text: "" } });
  assert.doesNotMatch(out[0].text, /\[fixed script\]/);
});
