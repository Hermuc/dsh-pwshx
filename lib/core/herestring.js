/**
 * PowerShell here-string 保护。
 *
 * 语法：
 *   $x = @"
 *   任意内容（可含引号、反斜杠、行尾反斜杠）
 *   "@
 *   （单引号版 @' ... '@ 完全不展开）
 *
 * 问题：fix 规则（续行转换、提示符剥离、CRLF 归一）会改写 here-string 内部，
 * 破坏内容甚至终止符。例如 here-string 最后一行为 `C:\path\` 时，
 * LC_BACKSLASH_TO_BACKTICK 会把行尾 \ 换成反引号，导致 "@ 无法收尾。
 *
 * 方案：在应用规则前把整个 here-string 块替换为不含特殊字符的占位符，
 * 规则跑完后再原样恢复。占位符只含字母、数字与 NUL 边界标记，
 * 任何规则都不会匹配它。
 */

// here-string 开头可以是 `$var = @"`（@ 前面有赋值），只要行尾是 @" / @'
// 且 @ 不在引号或单词内部（排除 Write-Output '@' 这类字面量）。
const START = /(^|[^"'\w])@(["'])[ \t]*$/;

/**
 * @param {string} text
 * @returns {{text: string, restore: (s: string) => string, blockCount: number}}
 */
export function protectHereStrings(text) {
  const lines = text.split("\n");
  /** @type {{token: string, block: string}[]} */
  const blocks = [];
  /** @type {string[]} */
  const out = [];

  let i = 0;
  while (i < lines.length) {
    const start = START.exec(lines[i]);
    if (start === null) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const quote = start[2];
    const endRe = new RegExp("^[ \\t]*" + (quote === '"' ? '"' : "'") + "@[ \\t]*$");
    let j = i + 1;
    while (j < lines.length && !endRe.test(lines[j])) j += 1;
    if (j >= lines.length) {
      // 未闭合：原样保留，交给 PowerShell 报错
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const block = lines.slice(i, j + 1).join("\n");
    const token = "\u0000HS" + blocks.length + "\u0000";
    blocks.push({ token, block });
    out.push(token);
    i = j + 1;
  }

  return {
    text: out.join("\n"),
    restore(s) {
      let restored = s;
      for (const entry of blocks) restored = restored.split(entry.token).join(entry.block);
      return restored;
    },
    blockCount: blocks.length,
  };
}
