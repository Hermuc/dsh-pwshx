import { test } from "node:test";
import assert from "node:assert/strict";

import { fix, SAFE_RULE_IDS } from "../lib/core/fixer.js";

test("safe level skips semantic rewrites (rm -rf untouched)", () => {
  const r = fix("rm -rf tmp", { platform: "win32", shell: "pwsh", level: "safe" });
  assert.equal(r.fixed, "rm -rf tmp");
  assert.equal(r.changed, false);
  assert.equal(r.level, "safe");
});

test("safe level still applies high-confidence rewrites", () => {
  const r = fix("ls -la", { platform: "win32", shell: "pwsh", level: "safe" });
  assert.equal(r.fixed, "Get-ChildItem -Force");
  assert.ok(r.fixes.some((f) => f.rule === "LS_FLAGS"));
});

test("full level applies semantic rewrites", () => {
  const r = fix("rm -rf tmp", { platform: "win32", shell: "pwsh", level: "full" });
  assert.equal(r.fixed, "Remove-Item tmp -Recurse -Force");
});

test("SAFE_RULE_IDS excludes dangerous rewrites", () => {
  for (const id of ["RM_FLAGS", "SED_AWK", "CHMOD", "BARE_VAR"]) {
    assert.equal(SAFE_RULE_IDS.has(id), false, id + " must not be in safe set");
  }
});

test("warnings are scanned on the original text", () => {
  const r = fix('Write-Output "hello', { platform: "win32", shell: "pwsh", level: "safe" });
  assert.ok(r.warnings.some((w) => w.rule === "QUOTE_BALANCE"));
});

test("BOM is stripped", () => {
  const r = fix("\uFEFFGet-ChildItem", { platform: "win32", shell: "pwsh", level: "safe" });
  assert.equal(r.fixed, "Get-ChildItem");
  assert.ok(r.fixes.some((f) => f.rule === "NORM_BOM"));
});

test("non-Windows shell disables windows-only rules", () => {
  const r = fix("ls -la", { platform: "linux", shell: "bash", level: "full" });
  assert.equal(r.fixed, "ls -la");
});
