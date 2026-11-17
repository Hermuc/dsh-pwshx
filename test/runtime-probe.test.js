import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSpawnable, packageFamilyOf, originOf, inPlace, labelOf, unpinnableWarning, effectiveRuntime,
} from "../lib/runtime/probe.js";

test("isSpawnable: existing file yes, missing no", () => {
  assert.equal(isSpawnable(process.execPath), true);
  assert.equal(isSpawnable("C:\\NoSuchFile_12345.exe"), false);
  assert.equal(isSpawnable(""), false);
});

test("packageFamilyOf: version-numbered Store directory", () => {
  assert.equal(packageFamilyOf("Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe"), "Microsoft.PowerShell_8wekyb3d8bbwe");
  assert.equal(packageFamilyOf("foo"), undefined);
});

test("originOf: ordinary / store-alias / store-package", () => {
  assert.equal(originOf("C:\\Program Files\\PowerShell\\7\\pwsh.exe"), "ordinary");
  assert.equal(originOf("C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\Microsoft.PowerShell_8wekyb3d8bbwe\\pwsh.exe"), "store-alias");
  assert.equal(originOf("C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\\pwsh.exe"), "store-package");
});

test("inPlace: ordinary and store-alias only", () => {
  assert.equal(inPlace("ordinary"), true);
  assert.equal(inPlace("store-alias"), true);
  assert.equal(inPlace("store-package"), false);
  assert.equal(inPlace("unknown"), false);
});

test("labelOf: human labels", () => {
  assert.equal(labelOf({ origin: "store-alias" }), "Store family alias");
  assert.equal(labelOf({ origin: "store-package" }), "version-numbered Store path");
  assert.equal(labelOf({ origin: "ordinary" }), "ordinary file");
});

test("unpinnableWarning: only usable store-package", () => {
  assert.match(unpinnableWarning({ usable: true, origin: "store-package" }), /do not pin/i);
  assert.equal(unpinnableWarning({ usable: true, origin: "ordinary" }), undefined);
  assert.equal(unpinnableWarning({ usable: false, origin: "store-package" }), undefined);
  assert.equal(unpinnableWarning(undefined), undefined);
});

test("effectiveRuntime: pinned row wins, then auto probe, then 5.1 fallback", () => {
  assert.equal(effectiveRuntime([{ pwshPath: "x", probed: "5.1" }], { auto: { usable: true, version: "7.6.8" } }), "5.1");
  assert.equal(effectiveRuntime([{ pwshPath: "x", disabled: true, probed: "5.1" }], { auto: { usable: true, version: "7.6.8" } }), "7.6.8");
  assert.equal(effectiveRuntime([], { auto: { usable: true, version: "7.6.8" } }), "7.6.8");
  assert.equal(effectiveRuntime([], { auto: { usable: false, path: "C:\\Windows\\WindowsPowerShell\\v1.0\\powershell.exe" } }), "5.1");
  assert.equal(effectiveRuntime([], { auto: undefined }), undefined);
});
