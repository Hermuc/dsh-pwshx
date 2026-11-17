import { test } from "node:test";
import assert from "node:assert/strict";
import { processJob, processSources, processOutcome } from "../lib/tool/background.js";

test("processOutcome: completed with exit code", () => {
  assert.deepEqual(processOutcome({ status: "completed", exitCode: 0 }), { status: "completed", detail: "exit code: 0" });
});

test("processOutcome: killed with signal", () => {
  assert.deepEqual(processOutcome({ status: "killed", signal: "SIGTERM" }), { status: "killed", detail: "signal: SIGTERM" });
});

test("processOutcome: sandbox denied note", () => {
  const o = processOutcome({ status: "completed", exitCode: 1, sandbox: { denied: true, mode: "workspace-write" } });
  assert.match(o.detail, /sandbox: file access denied under workspace-write mode/);
});

test("processSources: unbound returns empty", () => {
  const sources = processSources(() => undefined);
  assert.deepEqual(sources[0].read(5), { text: "", nextOffset: 5, lossy: false });
  assert.equal(sources[0].channel, "stdout");
  assert.equal(sources[1].channel, "stderr");
});

test("processSources: bound reads observed stream", () => {
  const proc = {
    observed: {
      stdout: { readFrom: (n) => ({ text: "hi", nextOffset: n + 2, lossy: false }) },
      stderr: { readFrom: (n) => ({ text: "", nextOffset: n, lossy: false }) },
    },
  };
  const sources = processSources(() => proc);
  assert.deepEqual(sources[0].read(0), { text: "hi", nextOffset: 2, lossy: false });
});

test("processJob: start failure -> failed", async () => {
  const job = processJob(async () => { throw new Error("boom"); }, () => ({ status: "completed", detail: "" }));
  const out = await job.done;
  assert.equal(out.status, "failed");
  assert.match(out.detail, /boom/);
  assert.ok(job.failure() !== undefined);
});

test("processJob: start resolves -> outcome", async () => {
  const proc = { done: Promise.resolve(), kill: () => true, status: "completed", exitCode: 0 };
  const job = processJob(async () => proc, (p) => ({ status: "completed", detail: "exit code: " + p.exitCode }));
  const out = await job.done;
  assert.deepEqual(out, { status: "completed", detail: "exit code: 0" });
});

