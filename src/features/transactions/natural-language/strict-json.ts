/** The wire contract permits one flat object containing only strings or null. */
export function parseModelFields(input: string): Record<string, string | null> {
  if (input.length > 16384)
    throw new Error("Model response exceeds the contract limit");
  const string =
    '"(?:[^"\\\\\\x00-\\x1f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
  const property = new RegExp(
    `\\s*(${string})\\s*:\\s*(${string}|null)\\s*`,
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
    const key: string = JSON.parse(match[1]);
    if (Object.hasOwn(result, key)) throw new Error("Duplicate JSON property");
    result[key] = JSON.parse(match[2]) as string | null;
    cursor = property.lastIndex;
    if (cursor === source.length - 1) return result;
    if (source[cursor] !== ",") throw new Error("Unexpected JSON structure");
    cursor += 1;
  }
  throw new Error("Unexpected trailing comma");
}
