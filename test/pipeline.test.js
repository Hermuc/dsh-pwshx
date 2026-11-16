import { test } from "node:test";
import assert from "node:assert/strict";

import { apply } from "../lib/index.js";

function makeHarness(config) {
  /** @type {any} */
  let tool;
  const calls = { resolve: [], execute: 0, lastSpec: null };
  const ctx = {
    tools: { register: (t) => { tool = t; } },
    get: (name) => {
      if (name === "workingDirectory") {
        return { ensure: async () => "D:\\PortableApps" };
      }
      if (name === "sandboxPolicy") return undefined;
      return undefined;
    },
    shell: {
      resolve: (req) => {
        calls.resolve.push(req);
        const spec = { ...req, resolved: true };
        calls.lastSpec = spec;
        return spec;
      },
      execute: async (spec) => {
        calls.execute += 1;
        calls.lastSpec = spec;
        return {
          result: async () => ({
            exitCode: 0,
            signal: null,
            timedOut: false,
            aborted: false,
            stdout: { text: "HARNESS-OK\n" },
            stderr: { text: "" },
          }),
        };
      },
    },
    shellEnv: { collect: () => ({ DSH_TEST: "1" }) },
  };
  apply(ctx, config);
  return { ctx, calls, getTool: () => tool };
}

const EXEC = { agent: { session: { header: { cwd: "D:\\PortableApps" } } } };

function decodeCommand(spec) {
  const m = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(spec.command);
  assert.ok(m, "expected base64 invocation, got: " + spec.command);
  return Buffer.from(m[1], "base64").toString("utf8");
}

test("registers the pwsh_safe tool", () => {
  const h = makeHarness({});
  const tool = h.getTool();
  assert.equal(tool.name, "pwsh_safe");
  assert.deepEqual(tool.parameters.required, ["script", "description"]);
});

test("auto-fixes ls -la before encoding", async () => {
  const h = makeHarness({});
  const res = await h.getTool().execute({ script: "ls -la", description: "list files" }, EXEC);
  assert.equal(res.refused, false);
  assert.equal(decodeCommand(h.calls.lastSpec), "Get-ChildItem -Force");
  assert.ok(res.fixes.some((f) => f.rule === "LS_FLAGS"));
  assert.equal(res.stdout.text, "HARNESS-OK\n");
});

test("passes quotes/CJK through untouched (only encoding differs)", async () => {
  const script = 'Write-Output "中文：你好 ""世界"" $env:USERNAME C:\\Windows"';
  const h = makeHarness({});
  const res = await h.getTool().execute({ script, description: "cjk probe" }, EXEC);
  assert.equal(decodeCommand(h.calls.lastSpec), script);
  assert.deepEqual(res.fixes, []);
});

test("blocking pitfall (bare npm) is refused and never executed", async () => {
  const h = makeHarness({});
  const res = await h.getTool().execute({ script: "npm install", description: "install deps" }, EXEC);
  assert.equal(res.refused, true);
  assert.match(res.refusalReason, /R10/);
  assert.match(res.refusalReason, /npm\.cmd/);
  assert.equal(h.calls.execute, 0);
});

test("dangerous command is refused by the gate", async () => {
  const h = makeHarness({ fixLevel: "off" });
  const res = await h.getTool().execute({ script: "Remove-Item -Recurse C:\\", description: "danger probe" }, EXEC);
  assert.equal(res.refused, true);
  assert.match(res.refusalReason, /dangerous command/);
  assert.equal(h.calls.execute, 0);
});

test("checkMode=warn lets blocking pitfalls through as advisory", async () => {
  const h = makeHarness({ checkMode: "warn" });
  const res = await h.getTool().execute({ script: "npm install", description: "install deps" }, EXEC);
  assert.equal(res.refused, false);
  assert.equal(h.calls.execute, 1);
});

test("fixLevel=off skips rewriting", async () => {
  const h = makeHarness({ fixLevel: "off" });
  const res = await h.getTool().execute({ script: "ls -la", description: "list files" }, EXEC);
  assert.equal(decodeCommand(h.calls.lastSpec), "ls -la");
  assert.deepEqual(res.fixes, []);
});

test("relative workdir resolves against the session cwd", async () => {
  const h = makeHarness({});
  await h.getTool().execute({ script: "Get-Location", description: "cwd probe", workdir: "sub/dir" }, EXEC);
  assert.equal(h.calls.lastSpec.workdir, "D:\\PortableApps\\sub\\dir");
});

test("absolute workdir is preserved", async () => {
  const h = makeHarness({});
  await h.getTool().execute({ script: "Get-Location", description: "cwd probe", workdir: "D:/Temp" }, EXEC);
  assert.equal(h.calls.lastSpec.workdir, "D:/Temp");
});

test("empty script throws", async () => {
  const h = makeHarness({});
  await assert.rejects(() => h.getTool().execute({ script: "   ", description: "x" }, EXEC), /non-empty string script/);
});

test("oversize script throws with a clear message", async () => {
  const h = makeHarness({ maxEncodedChars: 500 });
  await assert.rejects(
    () => h.getTool().execute({ script: "Write-Output '" + "x".repeat(2000) + "'", description: "big" }, EXEC),
    /too large after fix/
  );
});

test("executor exceptions are not swallowed", async () => {
  const h = makeHarness({});
  h.ctx.shell.execute = async () => { throw new Error("spawn failed"); };
  await assert.rejects(() => h.getTool().execute({ script: "Get-Date", description: "boom" }, EXEC), /spawn failed/);
});
test("pwsh: && chain is allowed through the pipeline", async () => {
  const h = makeHarness({});
  const res = await h.getTool().execute({ script: 'Write-Output "a" && Write-Output "b"', description: "and probe" }, EXEC);
  assert.equal(res.refused, false);
  assert.equal(h.calls.execute, 1);
});

test("powershell51 with fixLevel=off: && chain is blocked by R11", async () => {
  const h = makeHarness({ shell: "powershell51", fixLevel: "off" });
  const res = await h.getTool().execute({ script: 'Write-Output "a" && Write-Output "b"', description: "and probe" }, EXEC);
  assert.equal(res.refused, true);
  assert.match(res.refusalReason, /R11/);
  assert.equal(h.calls.execute, 0);
});

test("Remove-Item root is refused by the gate, not rewritten by fix", async () => {
  const h = makeHarness({});
  const res = await h.getTool().execute({ script: "Remove-Item -Recurse C:\\", description: "danger" }, EXEC);
  assert.equal(res.refused, true);
  assert.match(res.refusalReason, /dangerous command/);
  assert.deepEqual(res.fixes, []);
});
test("workingDirectory.ensure wins over session.header.cwd", async () => {
  const h = makeHarness({});
  const exec = { agent: { session: { header: { cwd: "C:\\elsewhere" } } } };
  await h.getTool().execute({ script: "Get-Location", description: "cwd probe" }, exec);
  assert.equal(h.calls.lastSpec.workdir, "D:\\PortableApps");
});

test("falls back to session.header.cwd when workingDirectory is missing", async () => {
  const h = makeHarness({});
  h.ctx.get = () => undefined;
  const exec = { agent: { session: { header: { cwd: "C:\\fallback" } } } };
  await h.getTool().execute({ script: "Get-Location", description: "cwd probe" }, exec);
  assert.equal(h.calls.lastSpec.workdir, "C:\\fallback");
});
test("registers the systemPrompt section through optional injection", () => {
  let section = null;
  const ctx = {
    tools: { register: () => {} },
    shell: { resolve: (r) => r, execute: async () => ({ result: async () => ({}) }) },
    shellEnv: { collect: () => ({}) },
    inject: (names, fn) => {
      assert.deepEqual(names, ["systemPrompt"]);
      fn({
        systemPrompt: {
          section: (s) => { section = s; },
          getSectionOrder: () => 42,
        },
      });
    },
  };
  apply(ctx, {});
  assert.ok(section, "section was not registered");
  assert.equal(section.name, "tool:pwsh-safe-plus");
  assert.equal(section.order, 42);
  assert.match(section.text, /pwsh_safe/);
});
