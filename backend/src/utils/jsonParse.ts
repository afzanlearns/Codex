export function repairTruncatedJson(json: string): string {
  let s = json.trim();
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
  s = s.replace(/,\s*\{[^}]*$/, '');
  s = s.replace(/,\s*$/, '');

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  while (stack.length) s += stack.pop();
  return s;
}

export function parseModelJson<T>(raw: string): T {
  const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : clean;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return JSON.parse(repairTruncatedJson(candidate)) as T;
  }
}
