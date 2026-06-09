export function sanitizeJson(raw: string): string {
  let s = raw.trim();

  // Remove markdown code fences and language identifiers
  s = s.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, '').trim();

  // Try to extract JSON object from surrounding text
  const objectMatch = s.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    s = objectMatch[0];
  }

  // Remove bad control characters (0x00-0x1F except \t, \n, \r)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Handle unescaped newlines within strings
  // Find string values and escape any raw newlines inside them
  let result = '';
  let inStr = false;
  let escape = false;
  for (const ch of s) {
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      result += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      result += ch;
      continue;
    }
    if (inStr && (ch === '\n' || ch === '\r')) {
      result += '\\n';
      continue;
    }
    result += ch;
  }

  // Remove trailing commas before closing braces/brackets
  result = result.replace(/,(\s*[}\]])/g, '$1');

  return result;
}

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
  const candidate = sanitizeJson(raw);

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // If that fails, try truncated repair
    return JSON.parse(repairTruncatedJson(candidate)) as T;
  }
}
