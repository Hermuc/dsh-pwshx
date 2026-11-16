import { test } from "node:test";
import assert from "node:assert/strict";

import { fix } from "../lib/core/fixer.js";

const ENV = { platform: "win32", shell: "pwsh", level: "full" };
const run = (s) => fix(s, ENV);

test("LS_FLAGS: ls -la -> Get-ChildItem -Force", () => {
  const r = run("ls -la");
  assert.equal(r.fixed, "Get-ChildItem -Force");
  assert.ok(r.fixes.some((f) => f.rule === "LS_FLAGS"));
});

test("LS_FLAGS: ls without flags is left alone (alias is valid)", () => {
  const r = run("ls");
  assert.equal(r.fixed, "ls");
  assert.equal(r.changed, false);
});

test("ENV_EXPORT: export FOO=bar -> $env:FOO='bar'", () => {
  const r = run("export FOO=bar");
  assert.equal(r.fixed, "$env:FOO='bar'");
  assert.ok(r.fixes.some((f) => f.rule === "ENV_EXPORT"));
});

test("DEV_NULL: /dev/null -> $null", () => {
  const r = run("Get-Process > /dev/null");
  assert.equal(r.fixed, "Get-Process > $null");
  assert.ok(r.fixes.some((f) => f.rule === "DEV_NULL"));
});

test("HEAD_TAIL: head -n 20 -> Get-Content -TotalCount 20", () => {
  const r = run("head -n 20 file.txt");
  assert.equal(r.fixed, "Get-Content file.txt -TotalCount 20");
  assert.ok(r.fixes.some((f) => f.rule === "HEAD_TAIL"));
});

test("NORM_LINEENDINGS: CRLF normalized to LF", () => {
  const r = run('Write-Output "a"\r\nWrite-Output "b"');
  assert.equal(r.fixed, 'Write-Output "a"\nWrite-Output "b"');
  assert.ok(r.fixes.some((f) => f.rule === "NORM_LINEENDINGS"));
});

test("STRIP_PROMPT: pasted PS prompt removed", () => {
  const r = run("PS C:\\Users\\An1> Get-ChildItem");
  assert.equal(r.fixed, "Get-ChildItem");
  assert.ok(r.fixes.some((f) => f.rule === "STRIP_PROMPT"));
});

test("LC_BACKSLASH_TO_BACKTICK: bash continuation becomes backtick", () => {
  const r = run("Get-ChildItem \\\n  -Recurse");
  assert.equal(r.fixed, "Get-ChildItem `\n  -Recurse");
  assert.ok(r.fixes.some((f) => f.rule === "LC_BACKSLASH_TO_BACKTICK"));
});

test("QUOTE_BALANCE: unbalanced quote is a warning, text untouched", () => {
  const r = run('Write-Output "hello');
  assert.equal(r.fixed, 'Write-Output "hello');
  assert.equal(r.changed, false);
  assert.ok(r.warnings.some((w) => w.rule === "QUOTE_BALANCE"));
});

test("AND_OR_CHAIN: pwsh 7 keeps && untouched", () => {
  const r = run("Write-Output a && Write-Output b");
  assert.equal(r.fixed, "Write-Output a && Write-Output b");
  assert.equal(r.changed, false);
});

test("AND_OR_CHAIN: powershell51 splits && into if ($?)", () => {
  const r = fix("Write-Output a && Write-Output b", { platform: "win32", shell: "powershell51", level: "full" });
  assert.equal(r.fixed, "Write-Output a; if ($?) { Write-Output b }");
  assert.ok(r.fixes.some((f) => f.rule === "AND_OR_CHAIN"));
});

test("RM_FLAGS: rm -rf -> Remove-Item -Recurse -Force (full level)", () => {
  const r = run("rm -rf tmp");
  assert.equal(r.fixed, "Remove-Item tmp -Recurse -Force");
  assert.ok(r.fixes.some((f) => f.rule === "RM_FLAGS"));
});

test("idempotency: fix(fix(x)) === fix(x) across representative scripts", () => {
  const samples = [
    "ls -la",
    "export A=1",
    "Get-Process > /dev/null",
    "head -n 5 a.txt",
    "PS C:\\x> Get-ChildItem",
    "Write-Output a && Write-Output b",
    'Write-Output "hello',
    "rm -rf tmp",
    "mkdir -p a/b",
    "touch a.txt",
    "which node",
    "Get-ChildItem \\\n -Recurse",
  ];
  for (const s of samples) {
    const once = run(s).fixed;
    const twice = run(once).fixed;
    assert.equal(twice, once, "not idempotent for: " + JSON.stringify(s));
  }
});
test("LC_BACKSLASH_TO_BACKTICK: drive root is not a continuation", () => {
  const r = fix("Remove-Item -Recurse C:\\", { ...ENV, level: "safe" });
  assert.equal(r.fixed, "Remove-Item -Recurse C:\\");
  assert.deepEqual(r.fixes, []);
});

test("LC_BACKSLASH_TO_BACKTICK: trailing path backslash untouched", () => {
  const r = fix("Get-ChildItem D:\\", { ...ENV, level: "safe" });
  assert.equal(r.fixed, "Get-ChildItem D:\\");
  assert.deepEqual(r.fixes, []);
});

test("LC_BACKSLASH_TO_BACKTICK: real continuation still converts", () => {
  const r = fix("Get-ChildItem \\\n  -Recurse", { ...ENV, level: "safe" });
  assert.equal(r.fixed, "Get-ChildItem `\n  -Recurse");
});
test("STRIP_PROMPT: PowerShell comment lines are never treated as prompts", () => {
  const r = fix("# 只有注释\n# 第二行注释", { platform: "win32", shell: "pwsh", level: "safe" });
  assert.equal(r.fixed, "# 只有注释\n# 第二行注释");
  assert.deepEqual(r.fixes, []);
});

test("STRIP_PROMPT: bash root prompt '#' is still stripped in bash mode", () => {
  const r = fix("# echo hi\n# echo bye", { platform: "linux", shell: "bash", level: "full" });
  assert.equal(r.fixed, "echo hi\necho bye");
});

test("STRIP_PROMPT: PS path prompt still stripped", () => {
  const r = fix("PS C:\\Users\\An1> Get-ChildItem", { platform: "win32", shell: "pwsh", level: "safe" });
  assert.equal(r.fixed, "Get-ChildItem");
});
test("LS_FLAGS keeps pipeline intact (no -Force at the end of the whole line)", () => {
  const r = fix("ls -la 'D:\\Repos' | Select-Object -First 3", { ...ENV });
  assert.equal(r.fixed, "Get-ChildItem 'D:\\Repos' -Force | Select-Object -First 3");
  assert.ok(r.fixes.some((f) => f.rule === "LS_FLAGS"));
});

test("LS_FLAGS keeps semicolon tail", () => {
  const r = fix("ls -la; Write-Output done", { ...ENV });
  assert.equal(r.fixed, "Get-ChildItem -Force; Write-Output done");
});

test("LS_FLAGS ignores pipes inside quotes", () => {
  const r = fix("ls -la 'a|b'", { ...ENV });
  assert.equal(r.fixed, "Get-ChildItem 'a|b' -Force");
});
test("GREP keeps pipeline intact", () => {
  const r = run('grep -n "test" README.md | Select-Object -First 2');
  assert.equal(r.fixed, 'Select-String -Pattern "test" -Path README.md | Select-Object -First 2');
  assert.ok(r.fixes.some((f) => f.rule === "GREP"));
});

test("HEAD_TAIL keeps pipeline intact", () => {
  const r = run("head -n 3 README.md | Select-Object -First 1");
  assert.equal(r.fixed, "Get-Content README.md -TotalCount 3 | Select-Object -First 1");
});

test("TAIL keeps pipeline intact", () => {
  const r = run("tail -n 5 README.md | Where-Object { $_ }");
  assert.equal(r.fixed, "Get-Content README.md -Tail 5 | Where-Object { $_ }");
});

test("RM_FLAGS keeps pipeline intact", () => {
  const r = run("rm -rf build | Out-Null");
  assert.equal(r.fixed, "Remove-Item build -Recurse -Force | Out-Null");
});

test("MKDIR_P keeps pipeline intact", () => {
  const r = run("mkdir -p a b | Out-Null");
  assert.ok(r.fixed.endsWith(" | Out-Null"));
});

test("TOUCH keeps pipeline intact", () => {
  const r = run("touch x.txt | Out-Null");
  assert.ok(r.fixed.endsWith(" | Out-Null"));
});
test("LS_FLAGS keeps 2>&1 redirect", () => {
  const r = run("ls -la 2>&1");
  assert.equal(r.fixed, "Get-ChildItem -Force 2>&1");
});

test("LS_FLAGS keeps stdout redirect", () => {
  const r = run("ls -la > out.txt");
  assert.equal(r.fixed, "Get-ChildItem -Force > out.txt");
});

test("LS_FLAGS keeps && chain", () => {
  const r = run("ls -la && Write-Output done");
  assert.equal(r.fixed, "Get-ChildItem -Force && Write-Output done");
});

test("HEAD_TAIL keeps 2>&1 redirect", () => {
  const r = run("head -n 3 f.txt 2>&1");
  assert.equal(r.fixed, "Get-Content f.txt -TotalCount 3 2>&1");
});

test("GREP keeps redirect and pipeline together", () => {
  const r = run('grep -n "x" f.txt 2>&1 | Select-Object -First 1');
  assert.equal(r.fixed, 'Select-String -Pattern "x" -Path f.txt 2>&1 | Select-Object -First 1');
});
test("LS_FLAGS does not treat quoted > as redirect", () => {
  const r = run('ls -la "a > b"');
  assert.equal(r.fixed, 'Get-ChildItem "a > b" -Force');
});

test("LS_FLAGS does not treat quoted 2>&1 as redirect", () => {
  const r = run('ls -la "a 2>&1 b"');
  assert.equal(r.fixed, 'Get-ChildItem "a 2>&1 b" -Force');
});
