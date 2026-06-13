import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api.js';
import { useStore, LIFECYCLE_LABELS } from '../store.js';

// CRM target fields the importer can fill. `group` drives the section headings.
const TARGET_FIELDS = [
  { key: 'name', label: 'Company name', group: 'Company', required: true, aliases: ['company', 'company name', 'account', 'business', 'organization', 'name'] },
  { key: 'domain', label: 'Domain', group: 'Company', aliases: ['domain', 'website domain', 'url', 'site'] },
  { key: 'website', label: 'Website', group: 'Company', aliases: ['website', 'web', 'site', 'homepage', 'url'] },
  { key: 'industry', label: 'Industry', group: 'Company', aliases: ['industry', 'vertical', 'sector', 'category'] },
  { key: 'employee_count', label: 'Employee count', group: 'Company', type: 'number', aliases: ['employees', 'employee count', 'headcount', 'size', 'staff', 'num employees'] },
  { key: 'ad_spend_range', label: 'Monthly ad spend', group: 'Company', aliases: ['ad spend', 'ad spend range', 'monthly ad spend', 'spend', 'budget', 'ad budget'] },
  { key: 'owner', label: 'Company owner', group: 'Company', aliases: ['owner', 'company owner', 'rep', 'sales rep', 'assigned to', 'account owner'] },
  { key: 'lifecycle_stage', label: 'Lifecycle stage', group: 'Company', aliases: ['lifecycle', 'lifecycle stage', 'stage', 'status'] },
  { key: 'contact_name', label: 'Contact name', group: 'Contact', aliases: ['contact', 'contact name', 'full name', 'person', 'name', 'first name'] },
  { key: 'contact_title', label: 'Contact title', group: 'Contact', aliases: ['title', 'contact title', 'job title', 'role', 'position'] },
  { key: 'contact_email', label: 'Contact email', group: 'Contact', aliases: ['email', 'contact email', 'e-mail', 'email address'] },
  { key: 'contact_phone', label: 'Contact phone', group: 'Contact', aliases: ['phone', 'contact phone', 'telephone', 'mobile', 'cell', 'phone number'] },
  { key: 'contact_source', label: 'Contact source', group: 'Contact', aliases: ['source', 'contact source', 'lead source', 'origin'] },
];

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');

// Best-guess mapping: exact alias match first, then substring.
function autoMap(headers) {
  const used = new Set();
  const mapping = {};
  const normHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const field of TARGET_FIELDS) {
    const exact = normHeaders.find((h) => !used.has(h.raw) && field.aliases.includes(h.n));
    const hit = exact || normHeaders.find((h) => !used.has(h.raw) && field.aliases.some((a) => h.n.includes(a) || a.includes(h.n)));
    if (hit) {
      mapping[field.key] = hit.raw;
      used.add(hit.raw);
    } else {
      mapping[field.key] = '';
    }
  }
  return mapping;
}

// Parse CSV text -> { headers, rows }. Handles quoted fields.
function parseCsv(text) {
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
      if (row.some((c) => c.trim() !== '')) grid.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) grid.push(row);
  if (!grid.length) return { headers: [], rows: [] };
  return gridToTable(grid);
}

function gridToTable(grid) {
  const headers = grid[0].map((h, i) => String(h).trim() || `Column ${i + 1}`);
  const rows = grid.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] != null ? String(r[i]).trim() : ''; });
    return obj;
  });
  return { headers, rows };
}

// Group consecutive rows by company key (domain, else name) into the import payload.
function buildCompanies(rows, mapping) {
  const col = (row, key) => (mapping[key] ? row[mapping[key]] || '' : '').trim();
  const byKey = new Map();
  let skipped = 0;
  for (const row of rows) {
    const name = col(row, 'name');
    if (!name) { skipped++; continue; }
    const key = (col(row, 'domain') || name).toLowerCase();
    if (!byKey.has(key)) {
      const empRaw = col(row, 'employee_count').replace(/[^\d]/g, '');
      byKey.set(key, {
        name,
        domain: col(row, 'domain') || undefined,
        website: col(row, 'website') || undefined,
        industry: col(row, 'industry') || undefined,
        employee_count: empRaw ? Number(empRaw) : undefined,
        ad_spend_range: col(row, 'ad_spend_range') || undefined,
        owner: col(row, 'owner') || undefined,
        lifecycle_stage: normLifecycle(col(row, 'lifecycle_stage')),
        contacts: [],
      });
    }
    const contactName = col(row, 'contact_name');
    if (contactName) {
      byKey.get(key).contacts.push({
        name: contactName,
        title: col(row, 'contact_title') || undefined,
        email: col(row, 'contact_email') || undefined,
        phone: col(row, 'contact_phone') || undefined,
        source: col(row, 'contact_source') || undefined,
      });
    }
  }
  return { companies: [...byKey.values()], skipped };
}

const LIFECYCLE_KEYS = Object.keys(LIFECYCLE_LABELS);
function normLifecycle(v) {
  if (!v) return undefined;
  const n = norm(v);
  const exact = LIFECYCLE_KEYS.find((k) => k === n || norm(LIFECYCLE_LABELS[k]) === n);
  return exact || undefined;
}

export default function Import() {
  const { run } = useStore();
  const [step, setStep] = useState('upload'); // upload | map | done
  const [table, setTable] = useState(null);   // { headers, rows }
  const [mapping, setMapping] = useState({});
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');

  const startMapping = (parsed, label) => {
    if (!parsed.headers.length || !parsed.rows.length) {
      setError('Could not find a header row plus at least one data row.');
      return;
    }
    setError(null);
    setResult(null);
    setTable(parsed);
    setMapping(autoMap(parsed.headers));
    setFileName(label || '');
    setStep('map');
  };

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
        startMapping(gridToTable(grid.filter((r) => r.some((c) => String(c).trim() !== ''))), file.name);
      } else {
        startMapping(parseCsv(await file.text()), file.name);
      }
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
    }
    e.target.value = '';
  };

  const parsePasted = () => {
    if (!text.trim()) return;
    startMapping(parseCsv(text), 'pasted data');
  };

  const preview = useMemo(
    () => (table ? buildCompanies(table.rows, mapping) : null),
    [table, mapping]
  );
  const nameMapped = Boolean(mapping.name);

  const setField = (key, header) => setMapping((m) => ({ ...m, [key]: header }));

  const doImport = () =>
    run(async () => {
      const summary = await api.post('/import', { companies: preview.companies });
      setResult(summary);
      setStep('done');
      setTable(null);
      setText('');
    }, 'Import complete');

  const reset = () => {
    setStep('upload');
    setTable(null);
    setText('');
    setError(null);
    setResult(null);
    setMapping({});
  };

  return (
    <div>
      <div className="page-head"><h1>Bulk import</h1></div>

      {step === 'upload' && (
        <div className="card">
          <p>
            Upload a <b>CSV or Excel file</b> (or paste rows below) to seed your prospect list — use whatever
            column names your spreadsheet already has. On the next step you'll map your columns to CRM fields.
          </p>
          <p className="muted small">
            Companies are matched by <b>domain</b> (then name) and updated rather than duplicated, so re-importing
            an enriched list is safe. Repeat a company across rows to attach multiple contacts.
          </p>
          <div className="row gap pad-top">
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              Choose CSV / Excel file
              <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={onFile} style={{ display: 'none' }} />
            </label>
            <span className="muted small">or paste rows below</span>
          </div>
          <textarea
            className="pad-top"
            rows={6}
            style={{ marginTop: 10 }}
            placeholder={'Paste CSV or tab/comma-separated rows with a header line, e.g.\nBusiness,Web,# Staff,Primary Contact,Email\nAcme HVAC,acmehvac.com,25,Jane Doe,jane@acmehvac.com'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row pad-top">
            <button className="btn" onClick={parsePasted} disabled={!text.trim()}>Use pasted data →</button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      {step === 'map' && table && (
        <>
          <div className="card">
            <div className="card-head">
              <h3>Map your columns {fileName && <span className="muted small">— {fileName}</span>}</h3>
              <button className="link-btn" onClick={reset}>↺ Start over</button>
            </div>
            <p className="muted small">
              We guessed the matches below from your headers — adjust any that are wrong. Only <b>Company name</b> is
              required; leave the rest as “— ignore —” if you don't have them.
            </p>

            {['Company', 'Contact'].map((group) => (
              <div key={group} className="map-group">
                <h4>{group} fields</h4>
                <div className="map-grid">
                  {TARGET_FIELDS.filter((f) => f.group === group).map((field) => (
                    <div key={field.key} className="map-row">
                      <label className="map-target">
                        {field.label}{field.required && <span className="req"> *</span>}
                      </label>
                      <select
                        className={field.required && !mapping[field.key] ? 'needs' : ''}
                        value={mapping[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                      >
                        <option value="">— ignore —</option>
                        {table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!nameMapped && <p className="error-text">Map a column to <b>Company name</b> to continue.</p>}
          </div>

          {preview && (
            <div className="card">
              <div className="card-head">
                <h3>
                  Preview — {preview.companies.length} companies,{' '}
                  {preview.companies.reduce((s, c) => s + c.contacts.length, 0)} contacts
                  {preview.skipped > 0 && <span className="muted small"> · {preview.skipped} rows skipped (no company name)</span>}
                </h3>
                <button className="btn primary" onClick={doImport} disabled={!nameMapped || preview.companies.length === 0}>
                  Import {preview.companies.length} companies
                </button>
              </div>
              <div className="table-card" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Company</th><th>Domain</th><th>Industry</th><th>Employees</th>
                      <th>Ad spend</th><th>Lifecycle</th><th>Contacts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.companies.slice(0, 50).map((c, i) => (
                      <tr key={i}>
                        <td><b>{c.name}</b></td>
                        <td>{c.domain || '—'}</td>
                        <td>{c.industry || '—'}</td>
                        <td>{c.employee_count ?? '—'}</td>
                        <td>{c.ad_spend_range || '—'}</td>
                        <td>{c.lifecycle_stage ? LIFECYCLE_LABELS[c.lifecycle_stage] : '—'}</td>
                        <td className="small">{c.contacts.map((ct) => ct.name).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.companies.length > 50 && <p className="muted small">…and {preview.companies.length - 50} more.</p>}
            </div>
          )}
        </>
      )}

      {step === 'done' && result && (
        <div className="card">
          <h3>Import complete ✅</h3>
          <p>
            {result.companies_created} companies created, {result.companies_updated} updated ·{' '}
            {result.contacts_created} contacts created, {result.contacts_updated} updated.
          </p>
          {result.skipped?.length > 0 && (
            <p className="muted small">Skipped rows: {result.skipped.map((s) => `#${s.index} (${s.reason})`).join(', ')}</p>
          )}
          <button className="btn primary" onClick={reset}>Import another file</button>
        </div>
      )}
    </div>
  );
}
