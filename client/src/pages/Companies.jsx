import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useStore, LIFECYCLE_LABELS } from '../store.js';
import Modal from '../components/Modal.jsx';
import CompanyBoard from '../components/CompanyBoard.jsx';
import { PreviewPanel, SummaryPanel, EmailComposer, NoteComposer } from '../components/CompanyActions.jsx';
import { Field, StageChip } from '../components/widgets.jsx';
import { fmtDate, fmtDateTime, fmtMoney, relTime } from '../format.js';

export function CompanyForm({ initial = {}, onSubmit, submitLabel = 'Save' }) {
  const { meta } = useStore();
  const [form, setForm] = useState({
    name: '', domain: '', industry: 'HVAC', employee_count: '',
    ad_spend_range: '', website: '', owner: '', lifecycle_stage: 'lead', ...initial,
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, employee_count: form.employee_count === '' ? null : Number(form.employee_count) });
      }}
    >
      <Field label="Company name *"><input required value={form.name} onChange={upd('name')} /></Field>
      <Field label="Domain"><input value={form.domain || ''} onChange={upd('domain')} placeholder="acmehvac.com" /></Field>
      <Field label="Industry"><input value={form.industry || ''} onChange={upd('industry')} /></Field>
      <Field label="Employee count"><input type="number" min="0" value={form.employee_count ?? ''} onChange={upd('employee_count')} /></Field>
      <Field label="Monthly ad spend">
        <select value={form.ad_spend_range || ''} onChange={upd('ad_spend_range')}>
          <option value="">—</option>
          {meta.ad_spend_ranges.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Website"><input value={form.website || ''} onChange={upd('website')} placeholder="https://…" /></Field>
      <Field label="Company owner"><input value={form.owner || ''} onChange={upd('owner')} placeholder="me" /></Field>
      <Field label="Lifecycle stage">
        <select value={form.lifecycle_stage || 'lead'} onChange={upd('lifecycle_stage')}>
          {meta.lifecycle_stages.map((s) => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
        </select>
      </Field>
      <div className="form-actions"><button className="btn primary" type="submit">{submitLabel}</button></div>
    </form>
  );
}

const ALL_COLUMNS = [
  { key: 'name', label: 'Company name', sort: 'name', always: true },
  { key: 'owner', label: 'Company owner', sort: 'owner' },
  { key: 'created_at', label: 'Create Date', sort: 'created_at' },
  { key: 'last_activity_at', label: 'Last Activity Date', sort: 'last_activity_at' },
  { key: 'lifecycle_stage', label: 'Lifecycle Stage', sort: 'lifecycle_stage' },
  { key: 'industry', label: 'Industry' },
  { key: 'employee_count', label: 'Employees', sort: 'employee_count' },
  { key: 'ad_spend_range', label: 'Ad Spend/mo' },
  { key: 'contact_count', label: 'Contacts' },
  { key: 'open_deal_value', label: 'Open Pipeline' },
  { key: 'latest_deal_stage', label: 'Deal Stage' },
  { key: 'open_task_count', label: 'Open Tasks' },
];
const DEFAULT_VISIBLE = ['name', 'owner', 'created_at', 'last_activity_at', 'lifecycle_stage', 'industry', 'contact_count', 'open_deal_value'];

const CREATED_PRESETS = [
  ['', 'Create date: any'], ['7', 'Created last 7 days'], ['30', 'Created last 30 days'], ['90', 'Created last 90 days'],
];
const ACTIVITY_PRESETS = [
  ['', 'Last activity: any'], ['7', 'Untouched 7+ days'], ['14', 'Untouched 14+ days'], ['30', 'Untouched 30+ days'],
];

const daysAgoIso = (days) => new Date(Date.now() - days * 86400000).toISOString();

export default function Companies() {
  const { run, meta, notify } = useStore();
  const me = localStorage.getItem('crm_display_name') || 'Curt';
  const navigate = useNavigate();

  const [view, setView] = useState(() => localStorage.getItem('crm_company_view') || 'table');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ owner: '', created: '', inactive: '', lifecycle_stage: '' });
  const [advanced, setAdvanced] = useState({ industry: '', ad_spend_range: '', employee_min: '', employee_max: '', deal_stage: '', no_deals: false });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sort, setSort] = useState({ by: 'last_activity_at', order: 'desc' });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [data, setData] = useState({ companies: [], total: 0 });
  const [facets, setFacets] = useState({ all: 0, mine: 0, unassigned: 0, owners: [] });
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('crm_company_cols'));
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_VISIBLE;
    } catch { return DEFAULT_VISIBLE; }
  });
  const [showColumns, setShowColumns] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [panel, setPanel] = useState(null);   // { type: 'preview' | 'summary', company }
  const [composer, setComposer] = useState(null); // { type: 'email' | 'note', company }
  const searchTimer = useRef(null);
  const colPanelRef = useRef(null);

  const params = useMemo(() => {
    const p = { sort: sort.by, order: sort.order };
    if (view === 'board') {
      p.limit = 500;
      p.offset = 0;
    } else {
      p.limit = perPage;
      p.offset = page * perPage;
    }
    if (search.trim()) p.q = search.trim();
    if (tab === 'mine') p.owner = me;
    if (tab === 'all' && filters.owner) p.owner = filters.owner;
    if (filters.created) p.created_after = daysAgoIso(Number(filters.created));
    if (filters.inactive) p.inactive_days = filters.inactive;
    if (filters.lifecycle_stage) p.lifecycle_stage = filters.lifecycle_stage;
    if (advanced.industry.trim()) p.industry = advanced.industry.trim();
    if (advanced.ad_spend_range) p.ad_spend_range = advanced.ad_spend_range;
    if (advanced.employee_min) p.employee_min = advanced.employee_min;
    if (advanced.employee_max) p.employee_max = advanced.employee_max;
    if (advanced.deal_stage) p.deal_stage = advanced.deal_stage;
    if (advanced.no_deals) p.no_deals = 'true';
    return p;
  }, [view, tab, search, filters, advanced, sort, page, perPage, me]);

  const load = () => {
    api.get(`/companies${qs(params)}`).then(setData).catch((e) => notify(e.message, true));
  };
  const loadFacets = () => {
    api.get(`/companies/facets?me=${encodeURIComponent(me)}`).then(setFacets).catch(() => {});
  };
  useEffect(() => { load(); }, [params]);
  useEffect(() => { loadFacets(); }, []);

  useEffect(() => {
    const close = (e) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target)) setShowColumns(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const refreshAll = () => { load(); loadFacets(); };

  const switchView = (v) => {
    localStorage.setItem('crm_company_view', v);
    setView(v);
  };

  const onSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(0); setSearch(value); }, 300);
  };
  const setFilter = (patch) => { setPage(0); setFilters((f) => ({ ...f, ...patch })); };
  const setAdv = (patch) => { setPage(0); setAdvanced((a) => ({ ...a, ...patch })); };

  const toggleSort = (col) => {
    if (!col.sort) return;
    setPage(0);
    setSort((s) => ({ by: col.sort, order: s.by === col.sort && s.order === 'asc' ? 'desc' : 'asc' }));
  };

  const toggleCol = (key) => {
    setVisibleCols((cols) => {
      const next = cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key];
      localStorage.setItem('crm_company_cols', JSON.stringify(next));
      return next;
    });
  };

  const createCompany = (form) =>
    run(async () => {
      const company = await api.post('/companies', form);
      setShowAdd(false);
      navigate(`/companies/${company.id}`);
    }, 'Company created');

  // Drag-and-drop between board columns: optimistic update, then PATCH.
  const moveLifecycle = (company, lifecycle_stage) => {
    setData((d) => ({
      ...d,
      companies: d.companies.map((c) => (c.id === company.id ? { ...c, lifecycle_stage } : c)),
    }));
    run(async () => {
      await api.patch(`/companies/${company.id}`, { lifecycle_stage });
    }, `${company.name} → ${LIFECYCLE_LABELS[lifecycle_stage]}`).catch(load);
  };

  const onCardAction = (type, company) => {
    if (type === 'email' || type === 'note') setComposer({ type, company });
    else setPanel({ type, company });
  };

  const exportCsv = async () => {
    const all = await api.get(`/companies${qs({ ...params, limit: 10000, offset: 0 })}`);
    const cols = ALL_COLUMNS.filter((c) => c.always || visibleCols.includes(c.key));
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = all.companies.map((c) => cols.map((col) => {
      switch (col.key) {
        case 'created_at': return esc(fmtDate(c.created_at));
        case 'last_activity_at': return esc(c.last_activity_at ? fmtDateTime(c.last_activity_at) : '');
        case 'lifecycle_stage': return esc(LIFECYCLE_LABELS[c.lifecycle_stage] || c.lifecycle_stage);
        case 'open_deal_value': return esc(c.open_deal_value);
        default: return esc(c[col.key]);
      }
    }).join(','));
    const header = cols.map((c) => esc(c.label)).join(',');
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${all.companies.length} companies`);
  };

  const cols = ALL_COLUMNS.filter((c) => c.always || visibleCols.includes(c.key));
  const totalPages = Math.max(1, Math.ceil(data.total / perPage));

  const cell = (c, col) => {
    switch (col.key) {
      case 'name':
        return (
          <>
            <Link to={`/companies/${c.id}`} onClick={(e) => e.stopPropagation()} className="company-link">{c.name}</Link>
            {c.domain && <div className="muted small">{c.domain}</div>}
          </>
        );
      case 'owner': return c.owner || <span className="muted">No owner</span>;
      case 'created_at': return fmtDate(c.created_at);
      case 'last_activity_at': return c.last_activity_at ? fmtDateTime(c.last_activity_at) : '--';
      case 'lifecycle_stage': return <span className="chip lifecycle">{LIFECYCLE_LABELS[c.lifecycle_stage] || c.lifecycle_stage}</span>;
      case 'industry': return c.industry || '--';
      case 'employee_count': return c.employee_count ?? '--';
      case 'ad_spend_range': return c.ad_spend_range || '--';
      case 'contact_count': return c.contact_count;
      case 'open_deal_value': return Number(c.open_deal_value) > 0 ? fmtMoney(c.open_deal_value) : '--';
      case 'latest_deal_stage': return <StageChip stage={c.latest_deal_stage} />;
      case 'open_task_count': return c.open_task_count > 0 ? c.open_task_count : '--';
      default: return null;
    }
  };

  return (
    <div>
      <div className="page-head">
        <div className="contact-tabs">
          {[['all', 'All companies', facets.all], ['mine', 'My companies', facets.mine]].map(([key, label, count]) => (
            <button key={key} className={`tab ${tab === key ? 'on' : ''}`} onClick={() => { setPage(0); setTab(key); }}>
              {label} <span className="tab-count">{count}</span>
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>Add company</button>
      </div>

      <div className="filter-bar">
        <input
          className="filter-search"
          placeholder="Search name or domain…"
          defaultValue={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <span className="toggle-group">
          <button className={view === 'table' ? 'on' : ''} onClick={() => switchView('table')}>☷ Table view</button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => switchView('board')}>▦ Board view</button>
        </span>
        {tab === 'all' && (
          <select value={filters.owner} onChange={(e) => setFilter({ owner: e.target.value })}>
            <option value="">Company owner: any</option>
            {facets.owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select value={filters.created} onChange={(e) => setFilter({ created: e.target.value })}>
          {CREATED_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.inactive} onChange={(e) => setFilter({ inactive: e.target.value })}>
          {ACTIVITY_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.lifecycle_stage} onChange={(e) => setFilter({ lifecycle_stage: e.target.value })}>
          <option value="">Lifecycle: any</option>
          {meta.lifecycle_stages.map((s) => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
        </select>
        <button className="link-btn" onClick={() => setShowAdvanced(!showAdvanced)}>
          ⚙ Advanced filters {showAdvanced ? '▴' : '▾'}
        </button>
        <span className="grow" />
        {view === 'table' && (
          <div className="col-panel-wrap" ref={colPanelRef}>
            <button className="btn small" onClick={() => setShowColumns(!showColumns)}>Edit columns</button>
            {showColumns && (
              <div className="col-panel">
                {ALL_COLUMNS.map((c) => (
                  <label key={c.key} className="checkbox-inline">
                    <input
                      type="checkbox"
                      disabled={c.always}
                      checked={c.always || visibleCols.includes(c.key)}
                      onChange={() => toggleCol(c.key)}
                    /> {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="btn small" onClick={exportCsv}>Export</button>
      </div>

      {showAdvanced && (
        <div className="filter-bar advanced">
          <input placeholder="Industry" style={{ width: 120 }} value={advanced.industry} onChange={(e) => setAdv({ industry: e.target.value })} />
          <select value={advanced.ad_spend_range} onChange={(e) => setAdv({ ad_spend_range: e.target.value })}>
            <option value="">Ad spend: any</option>
            {meta.ad_spend_ranges.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="number" placeholder="Emp ≥" style={{ width: 80 }} value={advanced.employee_min} onChange={(e) => setAdv({ employee_min: e.target.value })} />
          <input type="number" placeholder="Emp ≤" style={{ width: 80 }} value={advanced.employee_max} onChange={(e) => setAdv({ employee_max: e.target.value })} />
          <select value={advanced.deal_stage} onChange={(e) => setAdv({ deal_stage: e.target.value })}>
            <option value="">Deal stage: any</option>
            {meta.stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="checkbox-inline">
            <input type="checkbox" checked={advanced.no_deals} onChange={(e) => setAdv({ no_deals: e.target.checked })} />
            No deals yet
          </label>
          <button
            className="link-btn"
            onClick={() => setAdv({ industry: '', ad_spend_range: '', employee_min: '', employee_max: '', deal_stage: '', no_deals: false })}
          >Clear advanced</button>
        </div>
      )}

      {view === 'board' ? (
        <CompanyBoard companies={data.companies} onMove={moveLifecycle} onAction={onCardAction} />
      ) : (
        <>
          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  {cols.map((col) => (
                    <th key={col.key} className={col.sort ? 'sortable' : ''} onClick={() => toggleSort(col)}>
                      {col.label}
                      {sort.by === col.sort && (sort.order === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => setPanel({ type: 'preview', company: c })}>
                    {cols.map((col) => <td key={col.key}>{cell(c, col)}</td>)}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button title="Preview" onClick={() => setPanel({ type: 'preview', company: c })}>👁</button>
                        <button title="AI summary" onClick={() => setPanel({ type: 'summary', company: c })}>✨</button>
                        <button title="Send email" onClick={() => setComposer({ type: 'email', company: c })}>✉️</button>
                        <button title="Create note" onClick={() => setComposer({ type: 'note', company: c })}>📝</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.companies.length === 0 && (
                  <tr><td colSpan={cols.length + 1} className="muted center">No companies match. Add one or import a prospect list.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button className="icon-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
            <span className="page-indicator">{page + 1}</span>
            <button className="icon-btn" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>Next ›</button>
            <select value={perPage} onChange={(e) => { setPage(0); setPerPage(Number(e.target.value)); }}>
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n} per page</option>)}
            </select>
            <span className="muted small">{data.total} total</span>
          </div>
        </>
      )}

      {panel?.type === 'preview' && (
        <PreviewPanel
          company={panel.company}
          onClose={() => setPanel(null)}
          onChanged={refreshAll}
          onEmail={() => setComposer({ type: 'email', company: panel.company })}
          onNote={() => setComposer({ type: 'note', company: panel.company })}
          onSummary={() => setPanel({ type: 'summary', company: panel.company })}
        />
      )}
      {panel?.type === 'summary' && (
        <SummaryPanel company={panel.company} onClose={() => setPanel(null)} />
      )}
      {composer?.type === 'email' && (
        <EmailComposer company={composer.company} onClose={() => setComposer(null)} onSent={refreshAll} />
      )}
      {composer?.type === 'note' && (
        <NoteComposer company={composer.company} onClose={() => setComposer(null)} onSaved={refreshAll} />
      )}

      {showAdd && (
        <Modal title="Add company" onClose={() => setShowAdd(false)}>
          <CompanyForm onSubmit={createCompany} submitLabel="Create company" />
        </Modal>
      )}
    </div>
  );
}
