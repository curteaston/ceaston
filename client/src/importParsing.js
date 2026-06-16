export function rowHasValues(row) {
  return row.some((cell) => String(cell ?? '').trim() !== '');
}

export function nonEmptyRows(grid) {
  return grid.filter(rowHasValues);
}

// Parse CSV text into the table shape used by the import mapper.
export function parseCsv(text) {
  const grid = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
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
  const headers = grid[0].map((header, index) => String(header).trim() || `Column ${index + 1}`);
  const rows = grid.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => { obj[header] = row[index] != null ? String(row[index]).trim() : ''; });
    return obj;
  });
  return { headers, rows };
}
