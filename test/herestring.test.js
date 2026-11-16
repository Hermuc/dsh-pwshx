import { test } from "node:test";
import assert from "node:assert/strict";

import { protectHereStrings } from "../lib/core/herestring.js";
import { fix } from "../lib/core/fixer.js";

const ENV = { platform: "win32", shell: "pwsh", level: "safe" };

test("protectHereStrings detects a double-quoted block", () => {
  const src = '$t = @"\nhello\n"@';
  const g = protectHereStrings(src);
  assert.equal(g.blockCount, 1);
  assert.equal(g.restore(g.text), src);
});

test("protectHereStrings detects a single-quoted block", () => {
  const src = "$t = @'\nraw $x\n'@";
  const g = protectHereStrings(src);
  assert.equal(g.blockCount, 1);
  assert.equal(g.restore(g.text), src);
});

test("here-string content with trailing backslash is preserved", () => {
  const src = '$t = @"\nC:\\path\\\n"@\nWrite-Output $t';
  const r = fix(src, ENV);
  assert.equal(r.fixed, src);
  assert.deepEqual(r.fixes, []);
});

test("bash-looking words inside here-string are not rewritten", () => {
  const src = '$t = @"\nls -la and export A=1 and /dev/null\n"@';
  const r = fix(src, ENV);
  assert.equal(r.fixed, src);
});

test("unclosed here-string is left untouched", () => {
  const src = '$t = @"\nno end marker';
  const g = protectHereStrings(src);
  assert.equal(g.blockCount, 0);
  assert.equal(g.text, src);
});

test("text outside here-strings is still fixed", () => {
  const src = 'ls -la\n$t = @"\nls -la\n"@';
  const r = fix(src, ENV);
  assert.match(r.fixed, /^Get-ChildItem -Force\n/);
  assert.match(r.fixed, /ls -la\n"@/);
});
