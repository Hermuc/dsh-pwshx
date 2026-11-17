/**
 * pscheck-util.js —— 规则引擎共用的词法工具（无规则、无副作用）。
 */

/**
* Static pitfall rules engine for PowerShell commands.
*
* Rules distilled from the blog post 'PowerShell 实战踩坑大全'
* (https://chaggle.github.io/blog/2026/08/14/powershell-pitfalls/).
* Shared by the cordis plugin (src/index.ts) and the CLI (scripts/check-pwsh.mjs).
* Compiled by tsc + tsdown into lib/ (see tsdown.config.ts).
*/
export const BS = String.fromCharCode(92);

/** R1 is an advisory (console-encoding hint); R2–R11 are blocking pitfalls. */
export const KNOWN_SCOPES = [
	"env",
	"script",
	"global",
	"local",
	"private",
	"using",
	"function",
	"variable",
	"PSDefaultParameterValues",
	"PSScriptRoot",
	"PSCommandPath",
	"PID",
	"true",
	"false",
	"null"
];

export function isWordChar(c) {
	return c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c >= "0" && c <= "9" || c === "_";
}

export function isLetter(c) {
	return c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
}

export function hasWord(text, word) {
	const low = text.toLowerCase();
	const w = word.toLowerCase();
	let idx = 0;
	while ((idx = low.indexOf(w, idx)) >= 0) {
		const before = idx > 0 ? low[idx - 1] : "";
		const after = idx + w.length < low.length ? low[idx + w.length] : "";
		if (!isWordChar(before) && !isWordChar(after)) return true;
		idx += w.length;
	}
	return false;
}

/**
* Blank out everything inside single/double-quoted strings (and here-strings), keeping
* the length and the newlines intact, so command-position rules (R5/R10/R16/R17) never
* match words that are only *mentioned* in text.
*
* Real-session false positives this fixes: `Write-Output '--- npm audit summary ---'`
* and `git commit -m 'chore: pnpm upgrade'` were both denied by R10.
*/
export function maskStrings(cmd) {
	const out = cmd.split("");
	let quote = null;
	for (let i = 0; i < cmd.length; i++) {
		const ch = cmd[i];
		if (quote === null) {
			if (i > 0 && cmd[i - 1] === "@" && (ch === "'" || ch === "\"")) {
				const close = ch === "'" ? "\n'@" : "\n\"@";
				const end = cmd.indexOf(close, i);
				const stop = end < 0 ? cmd.length : end + close.length;
				for (let k = i + 1; k < stop; k++) if (cmd[k] !== "\n") out[k] = " ";
				i = stop - 1;
				continue;
			}
			if (ch === "'" || ch === "\"") quote = ch;
			continue;
		}
		if (quote === "\"" && ch === "`") {
			if (i + 1 < cmd.length) {
				out[i + 1] = " ";
				i++;
			}
			continue;
		}
		if (ch === quote) {
			if (quote === "'" && cmd[i + 1] === "'") {
				out[i + 1] = " ";
				i++;
				continue;
			}
			quote = null;
			continue;
		}
		if (ch !== "\n") out[i] = " ";
	}
	return out.join("");
}

/** Collect $name / ${name} variable occurrences. */
export function findVars(cmd) {
	const res = [];
	for (let i = 0; i < cmd.length; i++) {
		if (cmd[i] !== "$") continue;
		if (cmd[i + 1] === "{") {
			let j = i + 2;
			while (j < cmd.length && (isWordChar(cmd[j]) || cmd[j] === ":")) j++;
			if (cmd[j] === "}") {
				res.push({
					start: i,
					end: j + 1,
					braced: true,
					name: cmd.slice(i + 2, j),
					followedBy: cmd[j + 1] || ""
				});
				i = j;
			}
			continue;
		}
		if (!isLetter(cmd[i + 1] || "")) continue;
		let j = i + 1;
		while (j < cmd.length && isWordChar(cmd[j])) j++;
		res.push({
			start: i,
			end: j,
			braced: false,
			name: cmd.slice(i + 1, j),
			followedBy: cmd[j] || ""
		});
		i = j - 1;
	}
	return res;
}

/** 自动变量：后跟 . 是属性访问，不是路径展开陷阱。 */
export const AUTO_VARIABLES = new Set(["_", "PSItem", "args", "input", "this", "error", "host", "PID", "PSScriptRoot", "PSCommandPath", "PSVersionTable", "null", "true", "false"]);
