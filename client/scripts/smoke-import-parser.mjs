import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import readXlsxFile from 'read-excel-file/node';
import { gridToTable, nonEmptyRows, parseCsv } from '../src/importParsing.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const csv = parseCsv('Business,Website,# Staff,First Name,Email\n"Smoke, HVAC",smoke.example,42,Sam,sam@smoke.example\n');
assertEqual(csv.headers[0], 'Business', 'CSV first header');
assertEqual(csv.rows[0].Business, 'Smoke, HVAC', 'CSV quoted company name');
assertEqual(csv.rows[0].Email, 'sam@smoke.example', 'CSV email');

const tmpDir = join(tmpdir(), 'hvac-crm-import-parser');
mkdirSync(tmpDir, { recursive: true });
const workbookPath = join(tmpDir, `smoke-${Date.now()}.xlsx`);

const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Business</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Email</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Smoke HVAC</t></is></c>
      <c r="B2" t="inlineStr"><is><t>sam@smoke.example</t></is></c>
    </row>
  </sheetData>
</worksheet>`,
};

writeFileSync(workbookPath, Buffer.from(zipSync(Object.fromEntries(
  Object.entries(files).map(([name, content]) => [name, strToU8(content)])
))));

try {
  const result = await readXlsxFile(workbookPath);
  const grid = Array.isArray(result?.[0]?.data) ? result[0].data : result;
  const table = gridToTable(nonEmptyRows(grid));
  assert(table.headers.includes('Business'), 'XLSX headers should include Business');
  assertEqual(table.rows[0].Business, 'Smoke HVAC', 'XLSX company name');
  assertEqual(table.rows[0].Email, 'sam@smoke.example', 'XLSX email');
  console.log('Import parser smoke passed.');
} finally {
  try { unlinkSync(workbookPath); } catch {}
}
