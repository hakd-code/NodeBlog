// 最小 front-matter 解析器（yaml 子集：标量 / 行内数组 / 块数组 / 带引号字符串）
export function parseFrontMatter(source) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!m) return { data: {}, body: source };
  const data = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listItem = /^(\s*)-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      const val = unquote(listItem[2].trim());
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(val);
      continue;
    }
    const kv = /^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1];
    const rawValue = kv[2].trim();
    currentKey = key;
    if (rawValue === '') { data[key] = []; continue; }
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      data[key] = rawValue.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    } else if (rawValue === 'true' || rawValue === 'false') {
      data[key] = rawValue === 'true';
    } else {
      data[key] = unquote(rawValue);
    }
  }
  return { data, body: m[2] };
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
