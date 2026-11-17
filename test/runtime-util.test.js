import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, isSet, flattenReport, majorOf, envMs } from "../lib/runtime/util.js";

test("describe: Error -> message, other -> String", () => {
  assert.equal(describe(new Error("boom")), "boom");
  assert.equal(describe("plain"), "plain");
  assert.equal(describe(42), "42");
});

test("isSet: only non-empty strings", () => {
  assert.equal(isSet("x"), true);
  assert.equal(isSet(""), false);
  assert.equal(isSet("   "), true);
  assert.equal(isSet(1), false);
  assert.equal(isSet(undefined), false);
});

test("flattenReport: collapses newlines and indentation", () => {
  assert.equal(flattenReport("a\n  b\n\tc"), "a | b | c");
});

test("majorOf: parses the major version", () => {
  assert.equal(majorOf("7.6.8"), 7);
  assert.equal(majorOf("5.1"), 5);
  assert.equal(majorOf("9"), 9);
  assert.equal(majorOf(undefined), undefined);
  assert.equal(majorOf("abc"), undefined);
});

test("envMs: fallback for absent/invalid, value for valid", () => {
  assert.equal(envMs("DSH_PWSHX_TEST_ABSENT", 42), 42);
  process.env.DSH_PWSHX_TEST_OK = "123";
  process.env.DSH_PWSHX_TEST_BAD = "abc";
  process.env.DSH_PWSHX_TEST_NEG = "-1";
  try {
    assert.equal(envMs("DSH_PWSHX_TEST_OK", 42), 123);
    assert.equal(envMs("DSH_PWSHX_TEST_BAD", 42), 42);
    assert.equal(envMs("DSH_PWSHX_TEST_NEG", 42), 42);
  } finally {
    delete process.env.DSH_PWSHX_TEST_OK;
    delete process.env.DSH_PWSHX_TEST_BAD;
    delete process.env.DSH_PWSHX_TEST_NEG;
  }
});
