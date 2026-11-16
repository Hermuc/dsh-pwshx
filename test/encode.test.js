import { test } from "node:test";
import assert from "node:assert/strict";

import { encodedInvocation, encodeScript, DEFAULT_MAX_ENCODED_CHARS } from "../lib/core/encode.js";

function decodeInvocation(invocation) {
  const m = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(invocation);
  assert.ok(m, "base64 payload not found in invocation");
  return Buffer.from(m[1], "base64").toString("utf8");
}

test("round-trips CJK, quotes, dollar and backslashes", () => {
  const script = 'Write-Output "中文：你好，世界 $env:USERNAME"; Write-Output \'C:\\Windows\\System32\'';
  const { invocation } = encodeScript(script);
  assert.equal(decodeInvocation(invocation), script);
});

test("round-trips multiline scripts", () => {
  const script = "Get-ChildItem\n  -Recurse\n  -File";
  assert.equal(decodeInvocation(encodeScript(script).invocation), script);
});

test("invocation is pure ASCII", () => {
  const { invocation } = encodeScript("中文");
  assert.match(invocation, /^[\x20-\x7E]*$/);
});

test("reports character counts", () => {
  const r = encodeScript("Get-ChildItem");
  assert.equal(r.chars, r.invocation.length);
  assert.ok(r.base64Chars > 0);
});

test("throws instead of truncating on oversize scripts", () => {
  assert.throws(() => encodeScript("x".repeat(5000), { maxChars: 1000 }), /too large after fix/);
});

test("default limit is exported", () => {
  assert.equal(typeof DEFAULT_MAX_ENCODED_CHARS, "number");
  assert.ok(DEFAULT_MAX_ENCODED_CHARS > 10000);
});
