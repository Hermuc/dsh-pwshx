/**
 * Base64 编码 + 长度守卫。
 *
 * 编码后的脚本是纯 ASCII，引号 / $ / 反斜杠 / 换行 / 中文全部变成安全字符，
 * 由 PowerShell 端解码后原样执行 —— 这就是「转义物理免疫」的全部原理。
 */

export const DEFAULT_MAX_ENCODED_CHARS = 24000;

/**
 * 生成 pwsh 的 -EncodedCommand 等价调用串：固定 ASCII 模板 + base64 载荷。
 * 模板本身不含任何用户输入，因此不会被脚本内容破坏。
 *
 * @param {string} script 已修复的明文脚本（UTF-8）
 * @returns {string}
 */
export function encodedInvocation(script) {
  const b64 = Buffer.from(script, "utf8").toString("base64");
  return (
    "& ([ScriptBlock]::Create([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
    b64 +
    "'))))"
  );
}

/**
 * @param {string} script
 * @param {{maxChars?: number}} [opts]
 * @returns {{invocation: string, chars: number, base64Chars: number}}
 * @throws {Error} 超过上限时抛出，绝不静默截断
 */
export function encodeScript(script, opts = {}) {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_ENCODED_CHARS;
  const invocation = encodedInvocation(script);
  if (invocation.length > maxChars) {
    throw new Error(
      "pwsh_safe script too large after fix: encoded command is " +
        invocation.length +
        " chars, limit is " +
        maxChars +
        " (Windows argv cap). Split the script into smaller calls."
    );
  }
  return {
    invocation,
    chars: invocation.length,
    base64Chars: invocation.length - 74,
  };
}
