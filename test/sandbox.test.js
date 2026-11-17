import { test } from "node:test";
import assert from "node:assert/strict";
import { escalationModes, resolveStandingPolicy, approveSandboxEscalation } from "../lib/dsh/sandbox.js";

test("escalationModes: empty without a confining executor", () => {
  assert.deepEqual(escalationModes({}), []);
  assert.deepEqual(escalationModes({ shell: {} }), []);
  assert.deepEqual(escalationModes({ shell: { sandboxMode: undefined } }), []);
});

test("escalationModes: returns ESCALATION_TARGETS when confining", () => {
  const modes = escalationModes({ shell: { sandboxMode: "workspace-write" } });
  assert.ok(Array.isArray(modes));
  assert.ok(modes.length > 0);
});

test("resolveStandingPolicy: undefined without a policy service", () => {
  assert.equal(resolveStandingPolicy({ get: () => undefined }, {}), undefined);
});

test("resolveStandingPolicy: resolves with the session", () => {
  const ctx = { get: () => ({ resolve: (args) => ({ mode: "workspace-write", args }) }) };
  const policy = resolveStandingPolicy(ctx, { agent: { session: "s1" } });
  assert.equal(policy.mode, "workspace-write");
  assert.equal(policy.args.session, "s1");
});

test("approveSandboxEscalation: throws without confining executor", async () => {
  await assert.rejects(
    () => approveSandboxEscalation({}, "danger-full-access", "need it", {}, undefined),
    (err) => err.code === "SANDBOX_ESCALATION_UNAVAILABLE" || /not available/.test(err.message),
  );
});

test("approveSandboxEscalation: allowed-once returns the requested mode", async () => {
  const calls = [];
  const ctx = {
    shell: { sandboxMode: "workspace-write" },
    get: (name) => name === "approval"
      ? { request: async (req) => { calls.push(req); return "allowed-once"; } }
      : undefined,
  };
  const mode = await approveSandboxEscalation(
    ctx, "danger-full-access", "need to write outside the workspace",
    { agent: { session: "s1" }, callId: "c1", signal: undefined },
    { mode: "workspace-write" },
  );
  assert.equal(mode, "danger-full-access");
  assert.equal(calls.length, 1);
  assert.match(calls[0].reason, /escalate sandbox to danger-full-access/);
});

test("approveSandboxEscalation: same mode returns immediately without approval", async () => {
  let asked = 0;
  const ctx = {
    shell: { sandboxMode: "workspace-write" },
    get: () => ({ request: async () => { asked++; return "allowed-once"; } }),
  };
  const mode = await approveSandboxEscalation(
    ctx, "workspace-write", "same mode", { agent: { session: "s1" }, callId: "c1" }, { mode: "workspace-write" },
  );
  assert.equal(mode, "workspace-write");
  assert.equal(asked, 0);
});

test("approveSandboxEscalation: rejection propagates as SANDBOX_ESCALATION_REJECTED", async () => {
  const ctx = {
    shell: { sandboxMode: "workspace-write" },
    get: () => ({ request: async () => "rejected" }),
  };
  await assert.rejects(
    () => approveSandboxEscalation(ctx, "danger-full-access", "need it", { agent: { session: "s1" }, callId: "c1" }, { mode: "workspace-write" }),
    (err) => err.code === "SANDBOX_ESCALATION_REJECTED",
  );
});
