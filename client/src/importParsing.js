export function rowHasValues(row) {
  return Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '');
}

export function nonEmptyRows(grid) {
  return Array.isArray(grid) ? grid.filter(rowHasValues) : [];
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') i++;
      else if (ch === '"') inQuotes = false;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      count++;
    }
  }
  return count;
}

function detectDelimiter(text) {
  const lines = String(text ?? '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
    .slice(0, 10);
  const candidates = [',', '\t', ';'];
  const scores = candidates.map((delimiter) => [
    delimiter,
    lines.reduce((sum, line) => sum + countDelimiter(line, delimiter), 0),
  ]);
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0]?.[1] > 0 ? scores[0][0] : ',';
}

function normalizeHeader(header, index) {
  const cleaned = String(header ?? '').replace(/^\uFEFF/, '').trim();
  return cleaned || `Column ${index + 1}`;
}

export function uniqueHeaders(headers) {
  const used = new Set();
  const counters = new Map();
  return headers.map((header, index) => {
    const base = normalizeHeader(header, index);
    const baseKey = base.toLowerCase();
    let suffix = counters.get(baseKey) || 1;
    let candidate = base;
    while (used.has(candidate.toLowerCase())) {
      suffix++;
      candidate = `${base} ${suffix}`;
    }
    counters.set(baseKey, suffix);
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// Parse delimited text into the table shape used by the import mapper.
export function parseCsv(text) {
  const source = String(text ?? '');
  const delimiter = detectDelimiter(source);
  const grid = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (rowHasValues(row)) grid.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (rowHasValues(row)) grid.push(row);
  if (!grid.length) return { headers: [], rows: [] };
  return gridToTable(grid);
}

export function gridToTable(grid) {
  const source = Array.isArray(grid) ? grid : [];
  const headers = uniqueHeaders(source[0] || []);
  const rows = source.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => { obj[header] = row[index] != null ? String(row[index]).trim() : ''; });
    return obj;
  });
  return { headers, rows };
}
