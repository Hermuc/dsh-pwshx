import { test } from "node:test";
import assert from "node:assert/strict";

import { RULES, check, selftest, formatHits } from "../lib/core/pscheck.js";

test("rule table size is 23", () => {
  assert.equal(RULES.length, 23);
});

test("selftest: all 77 upstream cases pass", () => {
  assert.equal(selftest(), 0);
});

test("bare npm is blocking (R10)", () => {
  const r = check("npm install");
  assert.deepEqual(r.blocking.map((x) => x.id), ["R10"]);
});

test("npm.cmd is clean", () => {
  const r = check("npm.cmd install");
  assert.deepEqual(r.all.map((x) => x.id), []);
});

test("$var: colon pitfall is blocking (R2)", () => {
  const r = check('"attempt $attempt: downloading..."');
  assert.ok(r.blocking.some((x) => x.id === "R2"));
});

test("ternary is blocking (R3)", () => {
  const r = check('$v = ($a -gt 0) ? "yes" : "no"');
  assert.ok(r.blocking.some((x) => x.id === "R3"));
});

test("formatHits includes id, title and fix", () => {
  const text = formatHits(check("npm install").blocking, "zh");
  assert.match(text, /R10/);
  assert.match(text, /npm\.cmd/);
});
test("R4 does not flag $_.Property inside double quotes", () => {
  const r = check('Write-Output "--- $($_.Name) ---"');
  assert.equal(r.blocking.some((x) => x.id === "R4"), false);
});

test("R4 does not flag $PSItem.Property", () => {
  const r = check('Get-ChildItem | ForEach-Object { "$($PSItem.Name)" }');
  assert.equal(r.blocking.some((x) => x.id === "R4"), false);
});

test("R4 still flags the real path trap", () => {
  const r = check('Get-Content "C:\\$WINDOWS.~BT\\Sources\\Panther\\setupact.log"');
  assert.ok(r.blocking.some((x) => x.id === "R4"));
});
test("R4 does not flag ordinary variable property access", () => {
  const r = check('Write-Output "$files.Count items"');
  assert.equal(r.blocking.some((x) => x.id === "R4"), false);
});

test("R4 does not flag $obj.Name", () => {
  const r = check('Write-Output "$obj.Name"');
  assert.equal(r.blocking.some((x) => x.id === "R4"), false);
});

test("R4 still flags $WINDOWS.~BT (real trap)", () => {
  const r = check('Get-Content "$WINDOWS.~BT.file"');
  assert.ok(r.blocking.some((x) => x.id === "R4"));
});
test("R4 does not flag a lowercase variable used in a path join", () => {
  const r = check('Join-Path $logs "$n\\pnpm.log"');
  assert.equal(r.blocking.some((x) => x.id === "R4"), false);
});

test("R4 does not flag lowercase attribute access", () => {
  const r = check('Write-Output "$obj.Name"');
  assert.equal(r.blocking.some((x) => x.id === "R4"), false);
});
