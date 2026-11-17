/**
 * pscheck-rules-b.js —— R13–R23 的检测函数。
 */

import { AUTO_VARIABLES, BS, KNOWN_SCOPES, findVars, hasWord, isLetter, isWordChar, maskStrings } from "./pscheck-util.js";

export function r13UnderscoreInForeach(cmd) {
	const low = cmd.toLowerCase();
	if (!low.includes("foreach (") || !cmd.includes("$_")) return false;
	if (low.includes("foreach-object")) return false;
	return true;
}

export function r14AssignmentAsComparison(cmd) {
	const openers = [
		"if (",
		"while (",
		"elseif ("
	];
	for (let i = 0; i < cmd.length; i++) {
		let matched = false;
		for (const op of openers) if (cmd.startsWith(op, i)) {
			matched = true;
			break;
		}
		if (!matched) continue;
		let depth = 0;
		let j = i;
		for (; j < cmd.length; j++) {
			const ch = cmd[j];
			if (ch === "(") depth++;
			else if (ch === ")") {
				depth--;
				if (depth === 0) break;
			}
		}
		const inner = cmd.slice(i, j + 1);
		let q = null;
		for (let k = 0; k < inner.length - 1; k++) {
			const ch = inner[k];
			if (ch === "\"" || ch === "'") {
				if (q === null) q = ch;
				else if (q === ch && inner[k - 1] !== "`") q = null;
				continue;
			}
			if (q !== null) continue;
			if (ch !== "=") continue;
			const prev = k > 0 ? inner[k - 1] : "";
			const next = inner[k + 1];
			if ("=!<>+-*/%".includes(prev)) continue;
			if (next === "=") continue;
			return true;
		}
		i = j;
	}
	return false;
}

export function r15Ps7OnlySyntax(cmd) {
	return [
		"-AsHashtable",
		"-AsByteStream",
		"-Parallel",
		"??",
		"?."
	].some((t) => cmd.includes(t));
}

export function r16CmdStyle(cmd) {
	const lines = maskStrings(cmd).split("\n");
	const tokens = [
		"del ",
		"copy ",
		"move ",
		"mkdir "
	];
	for (const ln of lines) {
		const low = ln.toLowerCase();
		if (low.includes("cmd /c") || low.includes("cmd.exe /c")) continue;
		if (hasWord(ln, "bash") || hasWord(ln, "sh")) continue;
		for (const t of tokens) if (low.startsWith(t) || low.includes("; " + t) || low.includes("| " + t) || low.includes("& " + t)) return true;
		for (let i = 0; i < ln.length; i++) {
			if (ln[i] !== "%") continue;
			if (!isLetter(ln[i + 1] || "")) continue;
			let j = i + 1;
			while (j < ln.length && isWordChar(ln[j])) j++;
			if (ln[j] === "%") return true;
		}
	}
	return false;
}

export function r17WriteHost(cmd) {
	return hasWord(maskStrings(cmd), "Write-Host");
}

export const MOJIBAKE_RE = /[涓閿鍗鏋寤閮氬鍒绉戠殑鍦浘锟鈥斺撯]/;

export function r18Ps1Encoding(cmd) {
	if (cmd.includes("�") || cmd.includes("锟斤拷")) return true;
	return MOJIBAKE_RE.test(cmd);
}

export function r19RemoveItemObject(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		const low = ln.toLowerCase();
		if (!low.includes("remove-item")) continue;
		if (low.includes("-literalpath") || low.includes("-path")) continue;
		if (low.includes(".fullname")) continue;
		const sep = Math.max(ln.lastIndexOf("|"), ln.lastIndexOf(";"));
		const seg = ln.slice(sep + 1);
		if (/\$[A-Za-z_][A-Za-z0-9_]*/.test(seg)) return true;
	}
	return false;
}

export function r20HttpBodyEncoding(cmd) {
	if (!/Invoke-(RestMethod|WebRequest)/i.test(cmd)) return false;
	if (!/[^\x00-\x7F]/.test(cmd)) return false;
	if (!/(^|[\s;|(&])-Body([\s:=]|$)/i.test(cmd)) return false;
	if (/GetBytes|Text\.Encoding|Encoding\]::/i.test(cmd)) return false;
	return true;
}

export function r21ConvertFromJsonLockfile(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.includes("ConvertFrom-Json")) continue;
		if (/(package-lock|npm-shrinkwrap|pnpm-lock|yarn\.lock|\.lock\b)/i.test(ln)) return true;
	}
	return false;
}

export function r22NativeStdinPipe(cmd) {
	const targets = [
		"git credential",
		"git apply",
		"git am",
		"openssl ",
		"gpg "
	];
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.includes("|") || ln.includes("||")) continue;
		const seg = ln.slice(ln.lastIndexOf("|") + 1).trim().toLowerCase();
		for (const t of targets) if (seg.startsWith(t)) return true;
	}
	return false;
}

export function r23NativeStderrMerge(cmd) {
	const markerHints = [
		".exe",
		".bat",
		".ps1",
		".cmd "
	];
	const natives = [
		"git ",
		"node ",
		"npm.cmd",
		"npx.cmd",
		"pnpm.cmd",
		"curl ",
		"dism ",
		"wsl ",
		"python ",
		"docker ",
		"gh ",
		"ffmpeg ",
		"dotnet ",
		"cargo ",
		"java ",
		"openssl ",
		"ssh ",
		"pwsh ",
		"powershell "
	];
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.includes("2>&1")) continue;
		const low = ln.toLowerCase();
		if (low.includes("cmd /c") || low.includes("cmd.exe /c")) continue;
		let native = markerHints.some((m) => low.includes(m));
		if (!native) {
			const t = low.trim();
			for (const n of natives) if (t.startsWith(n) || t.includes("; " + n) || t.includes("| " + n) || t.includes("& " + n)) {
				native = true;
				break;
			}
		}
		if (native) return true;
	}
	return false;
}
