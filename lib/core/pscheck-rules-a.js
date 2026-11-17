/**
 * pscheck-rules-a.js —— R1–R12 的检测函数。
 */

import { AUTO_VARIABLES, BS, KNOWN_SCOPES, findVars, hasWord, isLetter, isWordChar, maskStrings } from "./pscheck-util.js";

export function r1Gbk(cmd) {
	if (!(hasWord(cmd, "wsl") || cmd.includes("Get-WindowsOptionalFeature") || cmd.includes("Enable-WindowsOptionalFeature") || cmd.includes("RestoreHealth") || cmd.includes("Cleanup-Image") || cmd.includes("/Get-"))) return false;
	if (hasWord(cmd, "chcp") || cmd.includes("65001") || /OutputEncoding/.test(cmd)) return false;
	return true;
}

export function r2VarColon(cmd) {
	for (const v of findVars(cmd)) {
		if (v.braced) continue;
		if (v.followedBy === ":" && KNOWN_SCOPES.indexOf(v.name) < 0) return true;
	}
	return false;
}

export function r3Ternary(cmd) {
	for (let i = 0; i < cmd.length - 1; i++) {
		if (cmd[i] !== ")") continue;
		let j = i + 1;
		while (j < cmd.length && (cmd[j] === " " || cmd[j] === "	" || cmd[j] === "\r")) j++;
		if (cmd[j] === "?") return true;
	}
	return false;
}

/** R4: a $WORD inside a double-quoted string followed by a dot or a backslash (path trap). */
export function r4DollarInDoubleQuotedPath(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		let inDQ = false;
		for (let i = 0; i < ln.length; i++) {
			const ch = ln[i];
			if (ch === "\"") {
				inDQ = !inDQ;
				continue;
			}
			if (ch !== "$" || !inDQ) continue;
			if (ln[i + 1] === "{") continue;
			if (!isLetter(ln[i + 1] || "")) continue;
			let j = i + 1;
			while (j < ln.length && isWordChar(ln[j])) j++;
			// 自动变量后跟属性访问（$_.Name / $PSItem.Name）不是路径陷阱，必须放行；
			// 否则任何在双引号里写 "$($_.Name)" 的脚本都会被 R4 误阻断。
			const varName = ln.slice(i + 1, j);
			if (AUTO_VARIABLES.has(varName)) { i = j - 1; continue; }
			const followed = ln[j] || "";
			// 只有「全大写变量名」（$WINDOWS / $SYSTEMROOT 这类环境变量风格）且后跟
			// 路径分隔符或点时，才可能是「以为是字面路径」的陷阱。
			// $n\pnpm.log（正常拼接）、$files.Count（属性访问）必须放行。
			const envStyle = varName.length >= 2 && /^[A-Z][A-Z0-9_]*$/.test(varName);
			if (envStyle && (followed === BS || followed === ".")) return true;
			i = j - 1;
		}
	}
	return false;
}

export function r5StartProcess(cmd) {
	return hasWord(maskStrings(cmd), "Start-Process");
}

export function r6FeatureNameArray(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.includes("Get-WindowsOptionalFeature")) continue;
		const k = ln.indexOf("-FeatureName");
		if (k < 0) continue;
		if (ln.slice(k + 12).includes(",")) return true;
	}
	return false;
}

export function r7DismountImage(cmd) {
	return cmd.toLowerCase().includes("/dismount-image");
}

export function r8RestoreHealthSource(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) if (ln.includes("RestoreHealth") && ln.toLowerCase().includes("/source")) return true;
	return false;
}

export function r9CurlResume(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.toLowerCase().includes("curl")) continue;
		if (ln.includes("-L") && (ln.includes("-C -") || ln.includes("-C-"))) return true;
	}
	return false;
}

/** R10: npm/npx/pnpm invoked without the .cmd suffix — PowerShell blocks npm.ps1 (ExecutionPolicy). */
export function r10NpmCmd(cmd) {
	const text = maskStrings(cmd);
	const names = [
		"npm",
		"npx",
		"pnpm"
	];
	const allowedBefore = " ;|&" + String.fromCharCode(9);
	for (const name of names) for (let i = 0; i < text.length; i++) {
		const prev = i > 0 ? text[i - 1] : "";
		if (prev !== "" && allowedBefore.indexOf(prev) < 0) continue;
		if (text.slice(i, i + name.length).toLowerCase() !== name) continue;
		const after = i + name.length < text.length ? text[i + name.length] : "";
		if (after === ".") continue;
		if (after !== "" && after !== " " && after !== "\"" && after !== "'" && after !== "	") continue;
		return true;
	}
	return false;
}

/** R11: && / || chain operators do not exist in Windows PowerShell 5.1 (PS 7+ only). */
export function r11NoAndOr(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (hasWord(ln, "bash") || hasWord(ln, "zsh") || hasWord(ln, "sh")) continue;
		const low = ln.toLowerCase();
		if (low.includes("cmd /c") || low.includes("cmd.exe /c")) continue;
		let q = null;
		for (let i = 0; i < ln.length - 1; i++) {
			const ch = ln[i];
			if (ch === "\"" || ch === "'") {
				if (q === null) q = ch;
				else if (q === ch && ln[i - 1] !== "`") q = null;
				continue;
			}
			if (q !== null) continue;
			if (ch === "&" && ln[i + 1] === "&" || ch === "|" && ln[i + 1] === "|") return true;
		}
	}
	return false;
}

export function r12JsonDepth(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.includes("ConvertTo-Json")) continue;
		if (ln.includes("-Depth")) continue;
		return true;
	}
	return false;
}
