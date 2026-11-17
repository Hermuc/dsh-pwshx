import { test } from "node:test";
import assert from "node:assert/strict";
import { extraPwshCandidates } from "../lib/runtime/detect.js";

test("extraPwshCandidates covers Store alias, Scoop and 7-preview", () => {
  const candidates = extraPwshCandidates({
    LOCALAPPDATA: "C:\\Users\\X\\AppData\\Local",
    ProgramFiles: "C:\\Program Files",
    USERPROFILE: "C:\\Users\\X",
  });
  assert.equal(candidates.length, 3);
  assert.ok(candidates[0].includes("WindowsApps"));
  assert.ok(candidates[1].includes("scoop"));
  assert.ok(candidates[2].includes("7-preview"));
});

test("extraPwshCandidates tolerates an empty environment", () => {
  const candidates = extraPwshCandidates({});
  assert.equal(candidates.length, 3);
  assert.ok(candidates.every((path) => typeof path === "string"));
});
