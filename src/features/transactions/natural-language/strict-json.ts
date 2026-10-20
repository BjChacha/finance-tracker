/** Decodes one regex-validated JSON literal; the pattern guarantees the shape, so a failure
 * here means the pattern and the parser disagree — surface it as the same contract error. */
function parseLiteral(text: string): string | number | null {
  try {
    return JSON.parse(text) as string | number | null;
  } catch {
    throw new Error("Malformed JSON property value");
  }
}

/** The wire contract permits one flat object containing only strings, numbers or null. */
export function parseModelFields(input: string): Record<string, string | null> {
  if (input.length > 16384)
    throw new Error("Model response exceeds the contract limit");
  const string =
    '"(?:[^"\\\\\\x00-\\x1f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
  // Numbers are accepted because models routinely emit `"amountCents": 1437` despite the
  // quoted shape in the prompt; rejecting the whole response over that would turn a
  // perfectly good decision into "unparseable". They are normalised to their literal text.
  const scalar = `${string}|null|-?[0-9]+(?:\\.[0-9]+)?`;
  const property = new RegExp(
    `\\s*(${string})\\s*:\\s*(${scalar})\\s*`,
    "y",
  );
  const source = input.trim();
  if (!source.startsWith("{") || !source.endsWith("}"))
    throw new Error("Expected a JSON object");
  const result: Record<string, string | null> = Object.create(null);
  let cursor = 1;
  if (source.slice(cursor, -1).trim() === "") return result;
  while (cursor < source.length - 1) {
    property.lastIndex = cursor;
    const match = property.exec(source);
    if (!match) throw new Error("Expected a string or null property");
    const key = parseLiteral(match[1]);
    if (typeof key !== "string") throw new Error("Expected a property name");
    if (Object.hasOwn(result, key)) throw new Error("Duplicate JSON property");
    const valueText = match[2];
    // 只有金额字段允许裸数字（模型常写成 1437）；其他字段维持 string|null，
    // 这样 {"type":1} 这类畸形响应仍被拒绝，而不是静默转成字符串。
    if (key !== "amountCents" && /^-?[0-9]+(?:\.[0-9]+)?$/.test(valueText)) {
      throw new Error("Expected a string or null property");
    }
    const parsed = parseLiteral(valueText);
    result[key] = parsed === null ? null : String(parsed);
    cursor = property.lastIndex;
    if (cursor === source.length - 1) return result;
    if (source[cursor] !== ",") throw new Error("Unexpected JSON structure");
    cursor += 1;
  }
  throw new Error("Unexpected trailing comma");
}
