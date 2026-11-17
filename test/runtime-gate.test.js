import { test } from "node:test";
import assert from "node:assert/strict";
import { gateFromReading } from "../lib/runtime/version-guard.js";

test("allow when the reading reports PowerShell 7", () => {
  const gate = gateFromReading({ version: "7.6.8", path: "C:\\pwsh.exe", source: "shell" }, [], {});
  assert.equal(gate.state, "allow");
  assert.equal(gate.reasonCode, "ok");
  assert.equal(gate.version, "7.6.8");
});

test("deny windows-powershell when the reading reports 5.1", () => {
  const gate = gateFromReading({ version: "5.1", path: "C:\\powershell.exe", source: "shell" }, [], {});
  assert.equal(gate.state, "deny");
  assert.equal(gate.reasonCode, "windows-powershell");
});

test("deny broken-pin when the pinned path does not exist", () => {
  const gate = gateFromReading({ path: "C:\\NoSuchFile_12345.exe", source: "shell" }, [], {});
  assert.equal(gate.state, "deny");
  assert.equal(gate.reasonCode, "broken-pin");
});

test("deny no-ps7 when nothing is known", () => {
  const gate = gateFromReading({}, [], {});
  assert.equal(gate.state, "deny");
  assert.equal(gate.reasonCode, "no-ps7");
});

test("falls back to row-derived runtime when no shell reading exists", () => {
  const gate = gateFromReading(undefined, [], { auto: { usable: true, version: "7.6.8" } });
  assert.equal(gate.state, "allow");
  assert.equal(gate.source, "rows");
});

test("recommended candidate is surfaced when a pinnable one exists", () => {
  const gate = gateFromReading({ version: "5.1", path: "C:\\powershell.exe" }, [], {
    override: { usable: true, path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe", version: "7.6.8", origin: "ordinary" },
  });
  assert.equal(gate.state, "deny");
  assert.equal(gate.recommended.path, "C:\\Program Files\\PowerShell\\7\\pwsh.exe");
});

test("detail: validator reason is carried into the gate snapshot", () => {
  const gate = gateFromReading({}, [], { auto: { usable: false, path: "C:\\x.exe", reason: "C:\\x.exe did not report a PowerShell version" } });
  assert.equal(gate.state, "deny");
  assert.match(gate.detail, /did not report a PowerShell version/);
});
