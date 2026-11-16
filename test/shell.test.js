import { test } from "node:test";
import assert from "node:assert/strict";

import { assertWorkdir, normalizeResult, normalizeStream, resolveSandboxPolicy } from "../lib/dsh/shell.js";

test("normalizeStream handles null / undefined / missing fields", () => {
  for (const input of [null, undefined, {}, { text: null }, { truncated: "yes" }]) {
    const s = normalizeStream(input);
    assert.equal(typeof s.text, "string");
    assert.equal(typeof s.truncated, "boolean");
  }
});

test("normalizeStream keeps spillPath only when a string", () => {
  assert.equal(normalizeStream({ spillPath: "D:\\x.log" }).spillPath, "D:\\x.log");
  assert.equal(normalizeStream({ spillPath: 42 }).spillPath, undefined);
});

test("normalizeResult tolerates an empty object", () => {
  const r = normalizeResult({});
  assert.equal(r.exitCode, null);
  assert.equal(r.signal, null);
  assert.equal(r.timedOut, false);
  assert.equal(r.aborted, false);
  assert.equal(r.stdout.text, "");
  assert.equal(r.stderr.text, "");
});

test("normalizeResult keeps a numeric exit code (including 0)", () => {
  assert.equal(normalizeResult({ exitCode: 0 }).exitCode, 0);
  assert.equal(normalizeResult({ exitCode: 3 }).exitCode, 3);
  assert.equal(normalizeResult({ exitCode: "3" }).exitCode, null);
});

test("resolveSandboxPolicy returns undefined without a service", () => {
  assert.equal(resolveSandboxPolicy({}, {}), undefined);
  assert.equal(resolveSandboxPolicy({ get: () => undefined }, {}), undefined);
});

test("resolveSandboxPolicy calls resolve with the session when present", () => {
  const session = { id: "s1" };
  let seen = null;
  const ctx = { get: () => ({ resolve: (scope) => { seen = scope; return { mode: "danger-full-access" }; } }) };
  const policy = resolveSandboxPolicy(ctx, { agent: { session } });
  assert.deepEqual(seen, { session });
  assert.equal(policy.mode, "danger-full-access");
});

test("resolveSandboxPolicy passes an empty scope without a session", () => {
  let seen = null;
  const ctx = { get: () => ({ resolve: (scope) => { seen = scope; return { mode: "workspace-write" }; } }) };
  resolveSandboxPolicy(ctx, {});
  assert.deepEqual(seen, {});
});

test("resolveSandboxPolicy swallows a throwing service", () => {
  const ctx = { get: () => ({ resolve: () => { throw new Error("boom"); } }) };
  assert.throws(() => resolveSandboxPolicy(ctx, {}), /boom/);
});
test("assertWorkdir throws for a missing directory", () => {
  assert.throws(() => assertWorkdir("D:/NoSuchDirXyz_12345"), /workdir does not exist/);
});

test("assertWorkdir accepts an existing directory", () => {
  assert.doesNotThrow(() => assertWorkdir(process.cwd()));
});

test("assertWorkdir ignores undefined", () => {
  assert.doesNotThrow(() => assertWorkdir(undefined));
});
