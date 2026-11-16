/**
 * 文本级命令解析工具：把一行命令拆成「命令体 / 重定向 / 管道 / 链式」片段。
 * 纯函数、零依赖，可单独移植到其他插件。
 */

/** 按行应用 fn 并重新拼接（保留 LF）。 */
export function mapLines(text, fn) {
  return text.split("\n").map(fn).join("\n");
}

/**
 * 把「命令体」与「重定向后缀」拆开。
 * 例：`f.txt 2>&1` → { body: 'f.txt', redirect: ' 2>&1' }
 *     `f.txt > out.txt` → { body: 'f.txt', redirect: ' > out.txt' }
 * 引号内的 > 不误判；支持 > >> 2> 2>> *> &> 2>&1。
 * @param {string} text
 * @returns {{body: string, redirect: string}}
 */
export function splitRedirect(text) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ((c === "\\" || c === "`") && i + 1 < text.length) { i++; continue; }
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (c === " " || c === "\t")) {
      const rest = text.slice(i);
      if (!/^[ \t]+(?:\d?>>?|\*?>|&>|\d?>&\d)(?:[ \t].*)?$/.test(rest)) continue;
      const body = text.slice(0, i).trim();
      if (body) return { body, redirect: rest };
    }
  }
  return { body: text, redirect: "" };
}

/**
 * 把一行拆成「命令头」与「管道/分号之后的部分」。
 * 单个 | 与 ; 是分隔符；单个 & 不是（调用运算符 / 2>&1）；&& 是链式操作符要切开。
 * 引号内与转义后的分隔符不算。
 * @param {string} rest
 * @returns {{head: string, tail: string}}
 */
export function splitCommandHead(rest) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    // 跳过转义序列：bash 的 \ 与 PowerShell 的反引号都不能让引号状态翻转
    if ((c === "\\" || c === "`") && i + 1 < rest.length) { i++; continue; }
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (c === "|" || c === ";") {
        const rawTail = rest.slice(i);
        return { head: rest.slice(0, i).trim(), tail: c === "|" ? " " + rawTail : rawTail };
      }
      if (c === "&" && rest[i + 1] === "&") {
        return { head: rest.slice(0, i).trim(), tail: " " + rest.slice(i) };
      }
    }
  }
  return { head: rest, tail: "" };
}

/** 在引号外拆分链式操作符(&& / ||)。 */
export function splitTopLevelChain(line) {
  const parts = [];
  let buf = "", inD = false, inS = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if ((c === "\\" || c === "`") && i + 1 < line.length) { buf += c + line[i + 1]; i++; continue; }
    if (c === '"' && !inS) inD = !inD;
    if (c === "'" && !inD) inS = !inS;
    if (!inD && !inS && (line.startsWith("&&", i) || line.startsWith("||", i))) {
      parts.push({ text: buf.trim(), op: null });
      parts.push({ op: line.slice(i, i + 2) });
      buf = "";
      i++;
      continue;
    }
    buf += c;
  }
  parts.push({ text: buf.trim(), op: null });
  const segs = parts.filter((p) => p.op === null);
  const ops = parts.filter((p) => p.op).map((p) => p.op);
  return ops.length > 0 ? { segs: segs.map((s) => s.text), ops } : null;
}
