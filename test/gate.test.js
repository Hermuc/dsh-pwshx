import { test } from "node:test";
import assert from "node:assert/strict";

import { executionGate } from "../lib/core/danger-gate.js";

test("blocks Remove-Item -Recurse on a drive root", () => {
  assert.ok(executionGate("Remove-Item -Recurse C:\\"));
});

test("blocks Format-Volume", () => {
  assert.ok(executionGate("Format-Volume -DriveLetter D"));
});

test("blocks setx (environment persistence)", () => {
  assert.ok(executionGate("setx PATH C:\\evil"));
});

test("allows a normal Remove-Item", () => {
  assert.equal(executionGate("Remove-Item .\\build -Recurse"), null);
});

test("allows Get-ChildItem", () => {
  assert.equal(executionGate("Get-ChildItem -Force"), null);
});
