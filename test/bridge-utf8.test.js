import { test } from "node:test";
import assert from "node:assert/strict";
import { utf8Command } from "../lib/bridge/utf8-console.js";

test("prefixes a command that does not pin UTF-8", () => {
  assert.equal(utf8Command("Get-ChildItem"), "chcp.com 65001 > $null; Get-ChildItem");
});

test("does not prefix twice", () => {
  assert.equal(utf8Command("chcp.com 65001 > $null; Get-ChildItem"), "chcp.com 65001 > $null; Get-ChildItem");
  // `chcp 65001;` is not the pinned form the bridge emits, so it is still prefixed.
  assert.equal(utf8Command("chcp 65001; Get-ChildItem"), "chcp.com 65001 > $null; chcp 65001; Get-ChildItem");
});

test("non-strings and empty strings pass through", () => {
  assert.equal(utf8Command(""), "");
  assert.equal(utf8Command(null), null);
  assert.equal(utf8Command(undefined), undefined);
  assert.equal(utf8Command(42), 42);
});
