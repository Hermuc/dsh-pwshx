import { test } from "node:test";
import assert from "node:assert/strict";

import { mapLines, splitCommandHead, splitRedirect, splitTopLevelChain } from "../lib/core/text.js";

test("splitCommandHead: pipe", () => {
  assert.deepEqual(splitCommandHead("ls -la | Select-Object"), { head: "ls -la", tail: " | Select-Object" });
});

test("splitCommandHead: semicolon", () => {
  assert.deepEqual(splitCommandHead("ls -la; Write-Output x"), { head: "ls -la", tail: "; Write-Output x" });
});

test("splitCommandHead: && chain", () => {
  assert.deepEqual(splitCommandHead("ls -la && Write-Output x"), { head: "ls -la", tail: " && Write-Output x" });
});

test("splitCommandHead: single & is not a separator", () => {
  assert.deepEqual(splitCommandHead("ls -la 2>&1"), { head: "ls -la 2>&1", tail: "" });
});

test("splitCommandHead: quoted pipe", () => {
  assert.deepEqual(splitCommandHead('ls -la "a|b"'), { head: 'ls -la "a|b"', tail: "" });
});

test("splitRedirect: 2>&1", () => {
  assert.deepEqual(splitRedirect("f.txt 2>&1"), { body: "f.txt", redirect: " 2>&1" });
});

test("splitRedirect: > file", () => {
  assert.deepEqual(splitRedirect("f.txt > out.txt"), { body: "f.txt", redirect: " > out.txt" });
});

test("splitRedirect: quoted > is not a redirect", () => {
  assert.deepEqual(splitRedirect('"a > b"'), { body: '"a > b"', redirect: "" });
});

test("mapLines: preserves LF", () => {
  assert.equal(mapLines("a\nb", (l) => l.toUpperCase()), "A\nB");
});

test("splitTopLevelChain: && and ||", () => {
  const r = splitTopLevelChain("a && b || c");
  assert.deepEqual(r, { segs: ["a", "b", "c"], ops: ["&&", "||"] });
});
