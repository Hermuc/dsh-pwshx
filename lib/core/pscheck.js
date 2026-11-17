/**
 * pscheck.js —— 规则引擎的公开入口：run / check / formatHits / selftest。
 */

import { SELFTEST_CASES } from "./pscheck-selftest.js";
import { RULES } from "./pscheck-rules.js";
export { RULES };

/** Run every rule against one command and return the matching rule objects. */
export function run(cmd) {
	return RULES.filter((r) => r.test(cmd));
}

/** Gate view: split matches into blocking and advisory buckets. */
export function check(cmd) {
	const all = run(cmd);
	return {
		blocking: all.filter((r) => r.severity === "blocking"),
		advisory: all.filter((r) => r.severity === "advisory"),
		all
	};
}

/** Render matched rules in the requested language, for deny reasons and CLI output. */
export function formatHits(hits, lang = "zh") {
	return hits.map((r) => "  [" + r.id + "] " + (lang === "en" ? r.titleEn : r.title) + "（" + r.blog + "）" + NL + "      " + (lang === "en" ? r.fixEn : r.fix)).join("" + NL);
}

/** Self-test battery; every case must match its expected rule ids. */
export function selftest() {
	let failures = 0;
	for (const c of SELFTEST_CASES) {
		const got = run(c.cmd).map((r) => r.id).sort().join(",");
		const want = c.expect.slice().sort().join(",");
		const ok = got === want;
		if (!ok) failures++;
		console.log((ok ? "  PASS" : "  FAIL") + "  " + c.label + "  got=[" + got + "] want=[" + want + "]");
	}
	console.log("");
	if (failures === 0) {
		console.log("[powershell-check] selftest: all " + SELFTEST_CASES.length + " cases pass");
		return 0;
	}
	console.log("[powershell-check] selftest: " + failures + "/" + SELFTEST_CASES.length + " cases FAILED");
	return 1;
}

export const NL = String.fromCharCode(10);
