import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { gridToTable, nonEmptyRows, parseCsv } from '../importParsing.js';
import { useStore, LIFECYCLE_LABELS } from '../store.js';
import {
  BUYING_COMMITTEE_LABELS,
  CONTACT_ROLE_LABELS,
  ROLE_COVERAGE,
  TARGET_TIER_LABELS,
} from '../prospecting.js';

// CRM target fields the importer can fill. `group` drives the section headings.
const TARGET_FIELDS = [
  { key: 'name', label: 'Company name', group: 'Company', required: true, aliases: ['company', 'company name', 'account', 'business', 'organization', 'name'] },
  { key: 'domain', label: 'Domain', group: 'Company', aliases: ['domain', 'company domain', 'account domain', 'website domain', 'url domain'] },
  { key: 'website', label: 'Website', group: 'Company', aliases: ['website', 'web', 'site', 'homepage', 'url'] },
  { key: 'industry', label: 'Industry', group: 'Company', aliases: ['industry', 'vertical', 'sector', 'category'] },
  { key: 'employee_count', label: 'Employee count', group: 'Company', type: 'number', aliases: ['employees', 'employee count', 'headcount', 'size', 'staff', 'num employees'] },
  { key: 'ad_spend_range', label: 'Monthly ad spend', group: 'Company', aliases: ['ad spend', 'ad spend range', 'monthly ad spend', 'spend', 'budget', 'ad budget'] },
  { key: 'company_owner', label: 'Company owner', group: 'Company', aliases: ['company owner', 'account owner', 'crm owner', 'owner', 'assigned to'] },
  { key: 'target_tier', label: 'Target tier', group: 'Company', aliases: ['target tier', 'tier', 'priority tier', 'account tier', 'fit tier', 'priority'] },
  { key: 'source', label: 'Source', group: 'Company', aliases: ['source', 'company source', 'account source', 'lead source', 'list source'] },
  { key: 'campaign', label: 'Campaign', group: 'Company', aliases: ['campaign', 'list', 'sequence', 'play', 'motion', 'source campaign'] },
  { key: 'buying_committee_status', label: 'Buying committee status', group: 'Company', aliases: ['buying committee', 'buying committee status', 'committee status', 'stakeholder status'] },
  { key: 'next_step', label: 'Next step', group: 'Company', aliases: ['next step', 'next action', 'action', 'todo', 'follow up', 'recommended action'] },
  { key: 'lifecycle_stage', label: 'Lifecycle stage', group: 'Company', aliases: ['lifecycle', 'lifecycle stage', 'stage', 'status'] },
  { key: 'company_phone', label: 'Company phone', group: 'Company', aliases: ['company phone', 'main phone', 'office phone', 'main line', 'company telephone'] },
  { key: 'contact_first_name', label: 'First name', group: 'Contact', aliases: ['first name', 'firstname', 'first', 'given name', 'contact first name', 'name'] },
  { key: 'contact_last_name', label: 'Last name', group: 'Contact', aliases: ['last name', 'lastname', 'last', 'surname', 'family name', 'contact last name'] },
  { key: 'contact_role', label: 'Buying role', group: 'Contact', aliases: ['contact role', 'buying role', 'buyer role', 'persona', 'stakeholder role', 'role'] },
  { key: 'contact_title', label: 'Contact title', group: 'Contact', aliases: ['title', 'contact title', 'job title', 'position'] },
  { key: 'contact_email', label: 'Primary email', group: 'Contact', aliases: ['email', 'contact email', 'e-mail', 'email address', 'primary email'] },
  { key: 'contact_email_2', label: 'Secondary email', group: 'Contact', aliases: ['email 2', 'secondary email', 'email2', 'alternate email', 'other email'] },
  { key: 'contact_phone_direct', label: 'Direct phone', group: 'Contact', aliases: ['direct phone', 'work phone', 'work direct phone', 'direct', 'phone', 'telephone', 'work direct', 'direct number'] },
  { key: 'contact_phone_cell', label: 'Cell phone', group: 'Contact', aliases: ['cell', 'cell phone', 'mobile', 'mobile phone', 'cellphone', 'cell number'] },
  { key: 'contact_phone_other', label: 'Other phone', group: 'Contact', aliases: ['other phone', 'other', 'alternate phone', 'home phone', 'fax'] },
  { key: 'contact_owner', label: 'Contact owner', group: 'Contact', aliases: ['contact owner', 'rep owner', 'contact assignee', 'assigned rep'] },
  { key: 'contact_source', label: 'Contact source', group: 'Contact', aliases: ['source', 'contact source', 'lead source', 'origin'] },
];

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
const enumNorm = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

function normalizeEnum(value, labels) {
  const text = enumNorm(value);
  if (!text) return undefined;
  return Object.entries(labels).find(([key, label]) => {
    const friendlyKey = enumNorm(key);
    return text === friendlyKey || text === enumNorm(label) || text === friendlyKey.replace(/\s+/g, '');
  })?.[0];
}

function inferContactRole(explicitRole, title) {
  const direct = normalizeEnum(explicitRole, CONTACT_ROLE_LABELS);
  if (direct) return direct;
  const t = norm(title);
  if (!t) return undefined;
  if (/\b(owner|founder|principal|president|ceo|chief executive)\b/.test(t)) return 'owner';
  if (/\b(marketing|growth|demand|brand|advertising|media)\b/.test(t)) return 'marketing';
  if (/\b(operations|operation|ops|service manager|install manager|installation manager|field manager|production manager)\b/.test(t)) return 'ops';
  if (/\b(gm|general manager)\b/.test(t)) return 'gm';
  if (/\b(office|administrator|admin)\b/.test(t)) return 'office_manager';
  if (/\b(dispatch|dispatcher)\b/.test(t)) return 'dispatcher';
  return undefined;
}

function inferBuyingCommitteeStatus(company) {
  const direct = normalizeEnum(company.buying_committee_status, BUYING_COMMITTEE_LABELS);
  if (direct) return direct;
  const roles = new Set(company.contacts.map((contact) => contact.contact_role).filter(Boolean));
  if (roles.size === 0) return undefined;
  const missing = ROLE_COVERAGE.filter((role) => !roles.has(role));
  if (missing.length === 0) return 'mapped';
  if (missing.length < ROLE_COVERAGE.length) return 'partial';
  return 'missing_roles';
}

function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return raw
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .replace(/^www\./, '');
  }
}

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

// Group rows by domain when available, otherwise by company name.
function buildCompanies(rows, mapping) {
  const col = (row, key) => (mapping[key] ? row[mapping[key]] || '' : '').trim();
  const byKey = new Map();
  let skipped = 0;
  for (const row of rows) {
    const name = col(row, 'name');
    if (!name) { skipped++; continue; }
    const website = col(row, 'website');
    const domain = normalizeDomain(col(row, 'domain') || website);
    const key = domain || name.toLowerCase();
    if (!byKey.has(key)) {
      const empRaw = col(row, 'employee_count').replace(/[^\d]/g, '');
      byKey.set(key, {
        name,
        domain: domain || undefined,
        website: website || undefined,
        industry: col(row, 'industry') || undefined,
        employee_count: empRaw ? Number(empRaw) : undefined,
        ad_spend_range: col(row, 'ad_spend_range') || undefined,
        owner: col(row, 'company_owner') || undefined,
        target_tier: normalizeEnum(col(row, 'target_tier'), TARGET_TIER_LABELS),
        source: col(row, 'source') || undefined,
        campaign: col(row, 'campaign') || undefined,
        buying_committee_status: col(row, 'buying_committee_status') || undefined,
        next_step: col(row, 'next_step') || undefined,
        lifecycle_stage: normLifecycle(col(row, 'lifecycle_stage')),
        phone: col(row, 'company_phone') || undefined,
        contacts: [],
      });
    }
    const firstName = col(row, 'contact_first_name');
    const lastName = col(row, 'contact_last_name');
    const contactName = firstName && lastName ? firstName + ' ' + lastName : firstName || lastName;
    if (contactName) {
      const title = col(row, 'contact_title');
      byKey.get(key).contacts.push({
        name: contactName,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        title: title || undefined,
        contact_role: inferContactRole(col(row, 'contact_role'), title),
        email: col(row, 'contact_email') || undefined,
        email_2: col(row, 'contact_email_2') || undefined,
        phone_direct: col(row, 'contact_phone_direct') || undefined,
        phone_cell: col(row, 'contact_phone_cell') || undefined,
        phone_other: col(row, 'contact_phone_other') || undefined,
        owner: col(row, 'contact_owner') || undefined,
        source: col(row, 'contact_source') || undefined,
      });
    }
  }
  const companies = [...byKey.values()].map((company) => ({
    ...company,
    buying_committee_status: inferBuyingCommitteeStatus(company),
  }));
  return { companies, skipped };
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
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const grid = await readXlsxFile(file);
        startMapping(gridToTable(nonEmptyRows(grid)), file.name);
      } else if (/\.xls$/i.test(file.name)) {
        setError('Legacy .xls files are not supported. Save the sheet as .xlsx or CSV and upload again.');
      } else if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        startMapping(parseCsv(await file.text()), file.name);
      } else {
        setError('Unsupported file type. Upload CSV, TSV, or XLSX.');
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
            Upload a <b>CSV, TSV, or XLSX file</b> (or paste rows below) to seed your prospect list — use whatever
            column names your spreadsheet already has. On the next step you'll map your columns to CRM fields.
          </p>
          <p className="muted small">
            Companies are matched by <b>domain</b> when available, then by name, so re-importing
            an enriched list is safer. Repeat a company across rows to attach multiple contacts.
          </p>
          <div className="row gap pad-top">
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              Choose CSV / TSV / XLSX file
              <input
                type="file"
                accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onFile}
                style={{ display: 'none' }}
              />
            </label>
            <span className="muted small">or paste rows below</span>
          </div>
          <p className="muted small">Legacy .xls files are not supported; open them in Excel or Sheets and save as .xlsx or CSV first.</p>
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
            {!nameMapped && <p className="error-text">Map Company name before importing.</p>}

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
                  Import {preview.companies.length} {preview.companies.length === 1 ? 'company' : 'companies'}{preview.companies.reduce((s, c) => s + c.contacts.length, 0) > 0 ? ` & ${preview.companies.reduce((s, c) => s + c.contacts.length, 0)} contacts` : ''}
                </button>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 6 }}>
                <table style={{ minWidth: 1180 }}>
                  <thead>
                    <tr>
                      <th>Company</th><th>Domain</th><th>Website</th><th>Industry</th><th>Employees</th>
                      <th>Ad spend</th><th>Lifecycle</th><th>Co. Phone</th>
                      <th>Contact name</th><th>Title</th><th>Primary email</th><th>Secondary email</th>
                      <th>Direct phone</th><th>Cell phone</th><th>Other phone</th><th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.companies.slice(0, 50).flatMap((c, i) => {
                      const contactRows = c.contacts.length > 0 ? c.contacts : [null];
                      return contactRows.map((ct, j) => (
                        <tr key={`${i}-${j}`}>
                          {j === 0 ? (
                            <>
                              <td rowSpan={contactRows.length}><b>{c.name || '—'}</b></td>
                              <td rowSpan={contactRows.length} className="small">{c.domain || '—'}</td>
                              <td rowSpan={contactRows.length} className="small">{c.website || '—'}</td>
                              <td rowSpan={contactRows.length}>{c.industry || '—'}</td>
                              <td rowSpan={contactRows.length}>{c.employee_count ?? '—'}</td>
                              <td rowSpan={contactRows.length}>{c.ad_spend_range || '—'}</td>
                              <td rowSpan={contactRows.length}>{c.lifecycle_stage ? LIFECYCLE_LABELS[c.lifecycle_stage] : '—'}</td>
                              <td rowSpan={contactRows.length}>{c.phone || '—'}</td>
                            </>
                          ) : null}
                          <td>{ct?.name || '—'}</td>
                          <td>{ct?.title || '—'}</td>
                          <td className="small">{ct?.email || '—'}</td>
                          <td className="small">{ct?.email_2 || '—'}</td>
                          <td>{ct?.phone_direct || '—'}</td>
                          <td>{ct?.phone_cell || '—'}</td>
                          <td>{ct?.phone_other || '—'}</td>
                          <td>{ct?.source || '—'}</td>
                        </tr>
                      ));
                    })}
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
