import { test } from "node:test";
import assert from "node:assert/strict";

import { PROMPT_SECTION_NAME, promptText } from "../lib/core/prompt.js";

test("section name is distinct from the official ones", () => {
  assert.equal(PROMPT_SECTION_NAME, "tool:pwshx");
  assert.notEqual(PROMPT_SECTION_NAME, "tool:pwsh");
  assert.notEqual(PROMPT_SECTION_NAME, "tool:pwsh-runtime");
});

test("prompt explains both guarantees", () => {
  const text = promptText();
  assert.match(text, /auto-fixed/i);
  assert.match(text, /base64/i);
});

test("prompt mentions the [auto-fix] marker", () => {
  assert.match(promptText(), /\[auto-fix\]/);
});
