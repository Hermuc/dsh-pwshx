import { test } from "node:test";
import assert from "node:assert/strict";
import { hintFor, runtimeNoteFor } from "../lib/runtime/note.js";

test("hintFor: PowerShell 7 allows && and ||", () => {
  const text = hintFor("7.6.8");
  assert.match(text, /PowerShell 7\.6\.8/);
  assert.match(text, /&&/);
});

test("hintFor: 5.1 is blocked with recovery instructions", () => {
  const text = hintFor("5.1");
  assert.match(text, /blocked by dsh-pwshx/);
  assert.match(text, /pwsh7_status/);
  assert.match(text, /pwsh7_install/);
});

test("hintFor: unknown version renders nothing", () => {
  assert.equal(hintFor(undefined), "");
});

test("runtimeNoteFor: readable runtime wins", () => {
  const text = runtimeNoteFor([], { auto: { usable: true, version: "7.6.8" } });
  assert.match(text, /7\.6\.8/);
});

test("runtimeNoteFor: broken pin is called out", () => {
  const text = runtimeNoteFor([{ pwshPath: "C:\\NoSuchFile_12345.exe" }], { auto: undefined });
  assert.match(text, /cannot start/);
  assert.match(text, /does not exist/);
});

test("runtimeNoteFor: nothing known renders nothing", () => {
  assert.equal(runtimeNoteFor([], { auto: undefined }), "");
});
