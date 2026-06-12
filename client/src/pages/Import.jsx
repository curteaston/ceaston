import { useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';

const COMPANY_COLS = ['name', 'domain', 'industry', 'employee_count', 'ad_spend_range', 'website'];
const CONTACT_COLS = ['contact_name', 'contact_title', 'contact_email', 'contact_phone', 'contact_source'];

// Minimal CSV parser with quoted-field support.
function parseCsv(text) {
  const rows = [];
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
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// Rows sharing a domain (or name) merge into one company with multiple contacts.
function rowsToCompanies(rows) {
  const header = rows[0].map((han) => han.trim().toLowerCase());
  const byKey = new Map();
  for (const raw of rows.slice(1)) {
    const get = (col) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (raw[idx] || '').trim() : '';
    };
    const name = get('name');
    if (!name) continue;
    const key = (get('domain') || name).toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        name,
        domain: get('domain') || undefined,
        industry: get('industry') || undefined,
        employee_count: get('employee_count') ? Number(get('employee_count')) : undefined,
        ad_spend_range: get('ad_spend_range') || undefined,
        website: get('website') || undefined,
        contacts: [],
      });
    }
    if (get('contact_name')) {
      byKey.get(key).contacts.push({
        name: get('contact_name'),
        title: get('contact_title') || undefined,
        email: get('contact_email') || undefined,
        phone: get('contact_phone') || undefined,
        source: get('contact_source') || undefined,
      });
    }
  }
  return [...byKey.values()];
}

export default function Import() {
  const { run } = useStore();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const buildPreview = (csv) => {
    setError(null);
    setResult(null);
    try {
      const rows = parseCsv(csv);
      if (rows.length < 2) throw new Error('Need a header row plus at least one data row.');
      const header = rows[0].map((han) => han.trim().toLowerCase());
      if (!header.includes('name')) throw new Error('CSV must include a "name" column for the company.');
      setPreview(rowsToCompanies(rows));
    } catch (e) {
      setPreview(null);
      setError(e.message);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    buildPreview(content);
  };

  const doImport = () =>
    run(async () => {
      const summary = await api.post('/import', { companies: preview });
      setResult(summary);
      setPreview(null);
      setText('');
    }, 'Import complete');

  return (
    <div>
      <div className="page-head"><h1>Bulk import</h1></div>
      <div className="card">
        <p>
          Paste or upload a CSV to seed your prospect list. Companies are matched by <b>domain</b> (then name)
          and updated rather than duplicated, so re-importing an enriched list is safe.
        </p>
        <p className="muted small">
          Columns — company: <code>{COMPANY_COLS.join(', ')}</code> · contact (optional): <code>{CONTACT_COLS.join(', ')}</code>.
          Repeat the company on multiple rows to add several contacts.
        </p>
        <textarea
          rows={8}
          placeholder={'name,domain,employee_count,ad_spend_range,contact_name,contact_email\nAcme HVAC,acmehvac.com,25,$1k-$5k,Jane Doe,jane@acmehvac.com'}
          value={text}
          onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) buildPreview(e.target.value); }}
        />
        <div className="row gap pad-top">
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {preview && (
        <div className="card">
          <div className="card-head">
            <h3>Preview — {preview.length} companies, {preview.reduce((s, c) => s + c.contacts.length, 0)} contacts</h3>
            <button className="btn primary" onClick={doImport}>Import now</button>
          </div>
          <table>
            <thead><tr><th>Company</th><th>Domain</th><th>Employees</th><th>Ad spend</th><th>Contacts</th></tr></thead>
            <tbody>
              {preview.slice(0, 50).map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td><td>{c.domain || '—'}</td><td>{c.employee_count ?? '—'}</td>
                  <td>{c.ad_spend_range || '—'}</td>
                  <td className="small">{c.contacts.map((ct) => ct.name).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 50 && <p className="muted small">…and {preview.length - 50} more.</p>}
        </div>
      )}

      {result && (
        <div className="card">
          <h3>Import result</h3>
          <p>
            ✅ {result.companies_created} companies created, {result.companies_updated} updated ·{' '}
            {result.contacts_created} contacts created, {result.contacts_updated} updated.
          </p>
          {result.skipped.length > 0 && (
            <p className="muted small">Skipped rows: {result.skipped.map((s) => `#${s.index} (${s.reason})`).join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
