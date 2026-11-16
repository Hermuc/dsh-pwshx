import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG, normalizeConfig } from "../lib/config.js";

test("defaults are stable", () => {
  assert.deepEqual(normalizeConfig(undefined), DEFAULT_CONFIG);
});

test("invalid enum values fall back", () => {
  const c = normalizeConfig({ fixLevel: "bogus", checkMode: 123, shell: null });
  assert.equal(c.fixLevel, "safe");
  assert.equal(c.checkMode, "block");
  assert.equal(c.shell, "pwsh");
});

test("non-positive numbers fall back", () => {
  const c = normalizeConfig({ timeoutMs: -5, maxEncodedChars: 0 });
  assert.equal(c.timeoutMs, 120000);
  assert.equal(c.maxEncodedChars, 24000);
});

test("valid overrides are kept", () => {
  const c = normalizeConfig({ fixLevel: "full", checkMode: "warn", shell: "powershell51", timeoutMs: 5000, maxEncodedChars: 9000 });
  assert.equal(c.fixLevel, "full");
  assert.equal(c.checkMode, "warn");
  assert.equal(c.shell, "powershell51");
  assert.equal(c.timeoutMs, 5000);
  assert.equal(c.maxEncodedChars, 9000);
});

test("fractional numbers are floored", () => {
  const c = normalizeConfig({ timeoutMs: 1234.9 });
  assert.equal(c.timeoutMs, 1234);
});
