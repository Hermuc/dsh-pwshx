import { test } from "node:test";
import assert from "node:assert/strict";

import { filterChecks, PS51_ONLY_RULE_IDS } from "../lib/core/checkgate.js";
import { check } from "../lib/core/pscheck.js";

const ids = (hits) => hits.map((h) => h.id);

test("PS51-only set contains R3 and R11", () => {
  assert.deepEqual([...PS51_ONLY_RULE_IDS], ["R3", "R11"]);
});

test("pwsh: && chain is not blocked", () => {
  const hits = filterChecks(check('Write-Output a && Write-Output b').all, "pwsh");
  assert.equal(hits.length, 0);
});

test("powershell51: && chain stays blocking", () => {
  const hits = filterChecks(check('Write-Output a && Write-Output b').all, "powershell51");
  assert.ok(ids(hits).includes("R11"));
});

test("pwsh: ternary is not blocked", () => {
  const hits = filterChecks(check('$v = ($a -gt 0) ? "y" : "n"').all, "pwsh");
  assert.equal(hits.length, 0);
});

test("powershell51: ternary stays blocking", () => {
  const hits = filterChecks(check('$v = ($a -gt 0) ? "y" : "n"').all, "powershell51");
  assert.ok(ids(hits).includes("R3"));
});

test("other pitfall rules survive the filter", () => {
  const hits = filterChecks(check("npm install").all, "pwsh");
  assert.ok(ids(hits).includes("R10"));
});
