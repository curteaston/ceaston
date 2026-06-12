import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useStore } from '../store.js';
import Modal from '../components/Modal.jsx';
import ContactDrawer from '../components/ContactDrawer.jsx';
import { CompanySelect, Field } from '../components/widgets.jsx';
import { fmtDate, fmtDateTime, relTime } from '../format.js';

const ALL_COLUMNS = [
  { key: 'name', label: 'Name', sort: 'name', always: true },
  { key: 'email', label: 'Email', sort: 'email' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'title', label: 'Title', sort: 'title' },
  { key: 'owner', label: 'Contact Owner', sort: 'owner' },
  { key: 'company', label: 'Primary Company', sort: 'company_name' },
  { key: 'last_contacted_at', label: 'Last Activity Date', sort: 'last_contacted_at' },
  { key: 'lead_status', label: 'Lead Status', sort: 'lead_status' },
  { key: 'source', label: 'Source' },
  { key: 'created_at', label: 'Create Date', sort: 'created_at' },
];
const DEFAULT_VISIBLE = ['name', 'email', 'phone', 'owner', 'company', 'last_contacted_at', 'lead_status'];

const CREATED_PRESETS = [
  ['', 'Create date: any'], ['7', 'Created last 7 days'], ['30', 'Created last 30 days'], ['90', 'Created last 90 days'],
];
const ACTIVITY_PRESETS = [
  ['', 'Last activity: any'], ['recent7', 'Active last 7 days'], ['recent30', 'Active last 30 days'],
  ['inactive30', 'Inactive 30+ days'], ['never', 'Never contacted'],
];

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function AddContactModal({ onClose, onSaved }) {
  const { run, meta } = useStore();
  const [companyId, setCompanyId] = useState('');
  const [form, setForm] = useState({
    name: '', title: '', email: '', phone: '', source: '', owner: '', lead_status: 'new',
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/contacts', { ...form, company_id: Number(companyId) });
      onSaved();
      onClose();
    }, 'Contact added');
  };

  return (
    <Modal title="Add contact" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Company *"><CompanySelect value={companyId} onChange={setCompanyId} /></Field>
        <Field label="Name *"><input required value={form.name} onChange={upd('name')} /></Field>
        <Field label="Title"><input value={form.title} onChange={upd('title')} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={upd('email')} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={upd('phone')} /></Field>
        <Field label="Source"><input value={form.source} onChange={upd('source')} /></Field>
        <Field label="Owner"><input value={form.owner} onChange={upd('owner')} placeholder="me" /></Field>
        <Field label="Lead status">
          <select value={form.lead_status} onChange={upd('lead_status')}>
            {meta.lead_statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="form-actions"><button className="btn primary" type="submit">Create contact</button></div>
      </form>
    </Modal>
  );
}

export default function Contacts() {
  const { run, meta, notify } = useStore();
  const me = localStorage.getItem('crm_display_name') || 'Curt';

  const [tab, setTab] = useState('all'); // all | mine | unassigned
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ owner: '', lead_status: '', created: '', activity: '' });
  const [advanced, setAdvanced] = useState({ source: '', title: '', has_email: false, has_phone: false });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sort, setSort] = useState({ by: 'name', order: 'asc' });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [data, setData] = useState({ contacts: [], total: 0 });
  const [facets, setFacets] = useState({ all: 0, mine: 0, unassigned: 0, owners: [] });
  const [selected, setSelected] = useState(new Set());
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('crm_contact_cols'));
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_VISIBLE;
    } catch { return DEFAULT_VISIBLE; }
  });
  const [showColumns, setShowColumns] = useState(false);
  const [drawerContact, setDrawerContact] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const searchTimer = useRef(null);
  const colPanelRef = useRef(null);

  const params = useMemo(() => {
    const p = { sort: sort.by, order: sort.order, limit: perPage, offset: page * perPage };
    if (search.trim()) p.q = search.trim();
    if (tab === 'mine') p.owner = me;
    if (tab === 'unassigned') p.unassigned = 'true';
    if (tab === 'all' && filters.owner) p.owner = filters.owner;
    if (filters.lead_status) p.lead_status = filters.lead_status;
    if (filters.created) p.created_after = daysAgoIso(Number(filters.created));
    if (filters.activity === 'recent7') p.last_contact_after = daysAgoIso(7);
    if (filters.activity === 'recent30') p.last_contact_after = daysAgoIso(30);
    if (filters.activity === 'inactive30') p.inactive_days = 30;
    if (filters.activity === 'never') p.never_contacted = 'true';
    if (advanced.source.trim()) p.source = advanced.source.trim();
    if (advanced.title.trim()) p.title = advanced.title.trim();
    if (advanced.has_email) p.has_email = 'true';
    if (advanced.has_phone) p.has_phone = 'true';
    return p;
  }, [tab, search, filters, advanced, sort, page, perPage, me]);

  const load = () => {
    api.get(`/contacts${qs(params)}`).then((d) => {
      setData(d);
      setSelected(new Set());
    }).catch((e) => notify(e.message, true));
  };
  const loadFacets = () => {
    api.get(`/contacts/facets?me=${encodeURIComponent(me)}`).then(setFacets).catch(() => {});
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

  const onSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(0); setSearch(value); }, 300);
  };

  const setFilter = (patch) => { setPage(0); setFilters((f) => ({ ...f, ...patch })); };

  const toggleSort = (col) => {
    if (!col.sort) return;
    setPage(0);
    setSort((s) => ({ by: col.sort, order: s.by === col.sort && s.order === 'asc' ? 'desc' : 'asc' }));
  };

  const toggleCol = (key) => {
    setVisibleCols((cols) => {
      const next = cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key];
      localStorage.setItem('crm_contact_cols', JSON.stringify(next));
      return next;
    });
  };

  const cols = ALL_COLUMNS.filter((c) => c.always || visibleCols.includes(c.key));
  const allSelected = data.contacts.length > 0 && data.contacts.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(data.contacts.map((c) => c.id)));
  const toggleOne = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const bulk = (action, patch) =>
    run(async () => {
      await api.post('/contacts/bulk', { ids: [...selected], action, patch });
      refreshAll();
    }, action === 'delete' ? 'Contacts deleted' : 'Contacts updated');

  const bulkAssign = () => {
    const owner = prompt(`Assign owner for ${selected.size} contact(s):`, me);
    if (owner !== null) bulk('update', { owner: owner.trim() });
  };
  const bulkDelete = () => {
    if (confirm(`Delete ${selected.size} contact(s)? Their notes and history will be removed.`)) bulk('delete');
  };

  const setLeadStatus = (contact, lead_status) =>
    run(async () => {
      await api.patch(`/contacts/${contact.id}`, { lead_status });
      load();
    });

  const exportCsv = async () => {
    const all = await api.get(`/contacts${qs({ ...params, limit: 10000, offset: 0 })}`);
    const rows = selected.size ? all.contacts.filter((c) => selected.has(c.id)) : all.contacts;
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const header = cols.map((c) => c.label);
    const lines = rows.map((c) => cols.map((col) => {
      switch (col.key) {
        case 'company': return esc(c.company_name);
        case 'last_contacted_at': return esc(c.last_contacted_at ? fmtDateTime(c.last_contacted_at) : '');
        case 'created_at': return esc(fmtDate(c.created_at));
        default: return esc(c[col.key]);
      }
    }).join(','));
    const blob = new Blob([[header.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Exported ${rows.length} contacts`);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));

  const cell = (c, col) => {
    switch (col.key) {
      case 'name':
        return (
          <button className="link-btn name-link" onClick={(e) => { e.stopPropagation(); setDrawerContact(c); }}>
            {c.name}
          </button>
        );
      case 'email':
        return c.email ? <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a> : '--';
      case 'phone':
        return c.phone ? <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}>{c.phone}</a> : '--';
      case 'title': return c.title || '--';
      case 'owner': return c.owner || <span className="muted">No owner</span>;
      case 'company':
        return (
          <Link to={`/companies/${c.company_id}`} className="company-link" onClick={(e) => e.stopPropagation()}>
            {c.company_name}
          </Link>
        );
      case 'last_contacted_at':
        return c.last_contacted_at
          ? <span title={fmtDateTime(c.last_contacted_at)}>{fmtDateTime(c.last_contacted_at)}</span>
          : '--';
      case 'lead_status':
        return (
          <select
            className="status-select"
            value={c.lead_status || 'new'}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setLeadStatus(c, e.target.value)}
          >
            {meta.lead_statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case 'source': return c.source || '--';
      case 'created_at': return fmtDate(c.created_at);
      default: return null;
    }
  };

  return (
    <div>
      <div className="page-head">
        <div className="contact-tabs">
          {[
            ['all', `All contacts`, facets.all],
            ['mine', 'My contacts', facets.mine],
            ['unassigned', 'Unassigned contacts', facets.unassigned],
          ].map(([key, label, count]) => (
            <button
              key={key}
              className={`tab ${tab === key ? 'on' : ''}`}
              onClick={() => { setPage(0); setTab(key); }}
            >
              {label} <span className="tab-count">{count}</span>
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}>Add contact</button>
      </div>

      <div className="filter-bar">
        <input
          className="filter-search"
          placeholder="Search name, email or phone…"
          defaultValue={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {tab === 'all' && (
          <select value={filters.owner} onChange={(e) => setFilter({ owner: e.target.value })}>
            <option value="">Contact owner: any</option>
            {facets.owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select value={filters.created} onChange={(e) => setFilter({ created: e.target.value })}>
          {CREATED_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.activity} onChange={(e) => setFilter({ activity: e.target.value })}>
          {ACTIVITY_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.lead_status} onChange={(e) => setFilter({ lead_status: e.target.value })}>
          <option value="">Lead status: any</option>
          {meta.lead_statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="link-btn" onClick={() => setShowAdvanced(!showAdvanced)}>
          ⚙ Advanced filters {showAdvanced ? '▴' : '▾'}
        </button>
        <span className="grow" />
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
        <button className="btn small" onClick={exportCsv}>Export</button>
      </div>

      {showAdvanced && (
        <div className="filter-bar advanced">
          <input
            placeholder="Source contains…" style={{ width: 150 }}
            value={advanced.source}
            onChange={(e) => { setPage(0); setAdvanced({ ...advanced, source: e.target.value }); }}
          />
          <input
            placeholder="Title contains…" style={{ width: 150 }}
            value={advanced.title}
            onChange={(e) => { setPage(0); setAdvanced({ ...advanced, title: e.target.value }); }}
          />
          <label className="checkbox-inline">
            <input
              type="checkbox" checked={advanced.has_email}
              onChange={(e) => { setPage(0); setAdvanced({ ...advanced, has_email: e.target.checked }); }}
            /> Has email
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox" checked={advanced.has_phone}
              onChange={(e) => { setPage(0); setAdvanced({ ...advanced, has_phone: e.target.checked }); }}
            /> Has phone
          </label>
          <button
            className="link-btn"
            onClick={() => { setPage(0); setAdvanced({ source: '', title: '', has_email: false, has_phone: false }); }}
          >Clear advanced</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <b>{selected.size} selected</b>
          <button className="btn small" onClick={bulkAssign}>Assign owner</button>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            <option value="">Set lead status…</option>
            {meta.lead_statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {bulkStatus && (
            <button className="btn small primary" onClick={() => { bulk('update', { lead_status: bulkStatus }); setBulkStatus(''); }}>
              Apply
            </button>
          )}
          <button className="btn small danger" onClick={bulkDelete}>Delete</button>
          <button className="link-btn" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th className="check-col">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              {cols.map((col) => (
                <th
                  key={col.key}
                  className={col.sort ? 'sortable' : ''}
                  onClick={() => toggleSort(col)}
                >
                  {col.label}
                  {sort.by === col.sort && (sort.order === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.contacts.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => setDrawerContact(c)}>
                <td className="check-col" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                </td>
                {cols.map((col) => <td key={col.key}>{cell(c, col)}</td>)}
              </tr>
            ))}
            {data.contacts.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="muted center">No contacts match.</td></tr>
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

      {drawerContact && (
        <ContactDrawer
          contact={drawerContact}
          onClose={() => { setDrawerContact(null); refreshAll(); }}
        />
      )}
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} onSaved={refreshAll} />}
    </div>
  );
}
