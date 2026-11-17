import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runtimeState, readRowConfig, resetInstallFailures, recordInstallFailure, circuitBreakerReport,
  setHostContext, getHostContext,
} from "../lib/runtime/state.js";

test("runtimeState: one state object per context", () => {
  const a = {};
  const b = {};
  assert.equal(runtimeState(a), runtimeState(a));
  assert.notEqual(runtimeState(a), runtimeState(b));
  assert.equal(runtimeState(a).installFailures, 0);
  assert.equal(runtimeState(a).gate.state, "unknown");
});

test("readRowConfig: captured fallback when no config entry exists", () => {
  const ctx = { configEditor: { entries: () => [] } };
  assert.deepEqual(readRowConfig(ctx, { overridePath: "C:\\x\\pwsh.exe", utf8Console: false }), {
    overridePath: "C:\\x\\pwsh.exe",
    utf8Console: false,
  });
  assert.deepEqual(readRowConfig(ctx, undefined), { overridePath: undefined, utf8Console: true });
});

test("readRowConfig: live entry wins over the captured fallback", () => {
  const ctx = {
    configEditor: {
      entries: () => [{ options: { name: "dsh-pwshx", config: { overridePath: "D:\\pwsh.exe", utf8Console: false } } }],
    },
  };
  assert.deepEqual(readRowConfig(ctx, { overridePath: "C:\\x.exe", utf8Console: true }), {
    overridePath: "D:\\pwsh.exe",
    utf8Console: false,
  });
});

test("readRowConfig: a throwing configEditor keeps the fallback", () => {
  const ctx = { configEditor: { entries: () => { throw new Error("boom"); } } };
  assert.deepEqual(readRowConfig(ctx, { overridePath: "C:\\x.exe", utf8Console: true }), {
    overridePath: "C:\\x.exe",
    utf8Console: true,
  });
});

test("install failure counter: increments, caps, resets", () => {
  const ctx = {};
  recordInstallFailure(ctx);
  assert.equal(runtimeState(ctx).installFailures, 1);
  recordInstallFailure(ctx);
  assert.equal(runtimeState(ctx).installFailures, 2);
  resetInstallFailures(ctx);
  assert.equal(runtimeState(ctx).installFailures, 0);
  for (let i = 0; i < 105; i++) recordInstallFailure(ctx);
  assert.equal(runtimeState(ctx).installFailures, 99);
});

test("circuitBreakerReport: stop text names the manual path and the confirmation", () => {
  const text = circuitBreakerReport();
  assert.match(text, /3 consecutive script installs/);
  assert.match(text, /userConfirmedFixed: true/);
  assert.match(text, /Manual install:/);
});

test("host context accessors round-trip", () => {
  const ctx = {};
  setHostContext(ctx);
  assert.equal(getHostContext(), ctx);
  setHostContext(null);
  assert.equal(getHostContext(), null);
});
