import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useStore, LIFECYCLE_LABELS } from '../store.js';
import Modal from '../components/Modal.jsx';
import ContactDrawer from '../components/ContactDrawer.jsx';
import { CompanySelect, Field, PhoneLink } from '../components/widgets.jsx';
import SavedViews from '../components/SavedViews.jsx';
import { fmtDate, fmtDateTime, relTime } from '../format.js';
import FilterDrawer, { FilterSection } from '../components/FilterDrawer.jsx';

const ALL_COLUMNS = [
  { key: 'name', label: 'Name', sort: 'name', always: true },
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Primary Email', sort: 'email' },
  { key: 'email_2', label: 'Secondary Email' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'phone_direct', label: 'Direct Phone' },
  { key: 'phone_cell', label: 'Cell Phone' },
  { key: 'phone_other', label: 'Other Phone' },
  { key: 'title', label: 'Title', sort: 'title' },
  { key: 'owner', label: 'Contact Owner', sort: 'owner' },
  { key: 'company', label: 'Primary Company', sort: 'company_name' },
  { key: 'last_contacted_at', label: 'Last Activity Date', sort: 'last_contacted_at' },
  { key: 'lead_status', label: 'Lead Status', sort: 'lead_status' },
  { key: 'source', label: 'Source' },
  { key: 'created_at', label: 'Create Date', sort: 'created_at' },
];
const DEFAULT_VISIBLE = ['name', 'email', 'phone', 'owner', 'company', 'last_contacted_at', 'lead_status'];

const LEAD_STATUSES = ['New', 'Working', 'Open', 'Qualified', 'Unqualified', 'Attempted to Contact', 'Connected', 'Bad Timing'];

const COMPANY_TYPES = ['HVAC Contractor', 'Plumbing', 'Electrical', 'General Contractor', 'Property Management', 'Distributor', 'Manufacturer', 'Other'];
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Mountain (Arizona, no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
];

const BLANK_FILTERS = {
  owner: '', unassigned: false,
  lead_statuses: [],
  source: '', title: '',
  has_email: false, has_phone: false,
  never_contacted: false,
  inactive_days: '',
  last_contact_from: '', last_contact_to: '',
  created_from: '', created_to: '',
  tags: [],
  email_contains: '',
  phone_contains: '',
  company_name: '',
  company_industry: '',
  company_type: '',
  company_lifecycle_stage: '',
  company_lead_status: '',
  company_owner: '',
  company_city: '',
  company_state: '',
  company_postal_code: '',
  company_timezone: '',
  company_ad_spend: '',
  company_revenue_min: '', company_revenue_max: '',
  company_employee_min: '', company_employee_max: '',
};

function CompanyTypeahead({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const { run } = useStore();
  const wrapRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    api.get(`/companies${qs({ sort: 'name', order: 'asc', limit: 10, q: query.trim() })}`)
      .then((d) => setResults(d.companies || []))
      .catch(() => {});
  }, [query]);

  const select = (company) => {
    onChange(company.id);
    setSelectedName(company.name);
    setQuery(company.name);
    setOpen(false);
  };

  const createCompany = () => {
    if (!newCompanyName.trim()) return;
    run(async () => {
      const company = await api.post('/companies', { name: newCompanyName.trim() });
      select(company);
      setShowCreate(false);
      setNewCompanyName('');
    }, 'Company created');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder="Type to search companies…"
        onChange={(e) => { setQuery(e.target.value); setSelectedName(''); onChange(''); setOpen(true); }}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        autoComplete="off"
      />
      {open && (query.trim()) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto'
        }}>
          {results.map((c) => (
            <div key={c.id} style={{ padding: '8px 12px', cursor: 'pointer' }}
              onMouseDown={() => select(c)}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.background = ''}
            >{c.name}</div>
          ))}
          {results.length === 0 && <div style={{ padding: '8px 12px', color: '#9ca3af' }}>No matches found</div>}
          <div
            style={{ padding: '8px 12px', cursor: 'pointer', color: '#2563eb', fontWeight: 600, borderTop: '1px solid #e5e7eb' }}
            onMouseDown={() => { setShowCreate(true); setOpen(false); setNewCompanyName(query.trim()); }}
          >+ Create New</div>
        </div>
      )}
      {showCreate && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 12
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>New company name</div>
          <input
            autoFocus
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCompany(); } }}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn small primary" onClick={createCompany}>Create</button>
            <button type="button" className="btn small" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddContactModal({ onClose, onSaved }) {
  const { run, meta } = useStore();
  const [companyId, setCompanyId] = useState('');
  const [form, setForm] = useState({
    firstName: '', lastName: '', title: '', email: '', phone: '', source: '', owner: '', lead_status: 'new',
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const name = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ');
    run(async () => {
      await api.post('/contacts', {
        name: name || undefined,
        title: form.title || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        source: form.source || undefined,
        owner: form.owner || undefined,
        lead_status: form.lead_status || undefined,
        company_id: companyId ? Number(companyId) : undefined,
      });
      onSaved();
      onClose();
    }, 'Contact added');
  };

  return (
    <Modal title="Add contact" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="First name"><input value={form.firstName} onChange={upd('firstName')} /></Field>
        <Field label="Last name"><input value={form.lastName} onChange={upd('lastName')} /></Field>
        <Field label="Company"><CompanyTypeahead value={companyId} onChange={setCompanyId} /></Field>
        <Field label="Title"><input value={form.title} onChange={upd('title')} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={upd('email')} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={upd('phone')} /></Field>
        <Field label="Source"><input value={form.source} onChange={upd('source')} /></Field>
        <Field label="Owner"><input value={form.owner} onChange={upd('owner')} placeholder="me" /></Field>
        <Field label="Lead status">
          <select value={form.lead_status} onChange={upd('lead_status')}>
            {meta.lead_statuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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
  const [searchKey, setSearchKey] = useState(0);
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [allTags, setAllTags] = useState([]);
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
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);
  const navigate = useNavigate();
  const [bulkStatus, setBulkStatus] = useState('');
  const searchTimer = useRef(null);
  const colPanelRef = useRef(null);

  const setF = (patch) => { setPage(0); setFilters((f) => ({ ...f, ...patch })); };

  const activeFilterCount = useMemo(() => [
    filters.owner, filters.unassigned,
    filters.lead_statuses.length > 0,
    filters.source, filters.title,
    filters.has_email, filters.has_phone,
    filters.never_contacted,
    filters.inactive_days, filters.last_contact_from, filters.last_contact_to,
    filters.created_from, filters.created_to,
    filters.tags.length > 0,
    filters.email_contains, filters.phone_contains,
    filters.company_name, filters.company_industry, filters.company_type,
    filters.company_lifecycle_stage, filters.company_lead_status, filters.company_owner,
    filters.company_city, filters.company_state, filters.company_postal_code, filters.company_timezone,
    filters.company_ad_spend, filters.company_revenue_min, filters.company_revenue_max,
    filters.company_employee_min, filters.company_employee_max,
  ].filter(Boolean).length, [filters]);

  const params = useMemo(() => {
    const p = { sort: sort.by, order: sort.order, limit: perPage, offset: page * perPage };
    if (search.trim()) p.q = search.trim();
    if (tab === 'mine') p.owner = me;
    if (tab === 'unassigned') p.unassigned = 'true';
    if (tab === 'all' && filters.owner) p.owner = filters.owner;
    if (filters.unassigned) p.unassigned = 'true';
    if (filters.lead_statuses.length) p.lead_status = filters.lead_statuses.join(',');
    if (filters.source.trim()) p.source = filters.source.trim();
    if (filters.title.trim()) p.title = filters.title.trim();
    if (filters.has_email) p.has_email = 'true';
    if (filters.has_phone) p.has_phone = 'true';
    if (filters.never_contacted) p.never_contacted = 'true';
    if (filters.inactive_days) p.inactive_days = filters.inactive_days;
    if (filters.last_contact_from) p.last_contact_after = filters.last_contact_from;
    if (filters.last_contact_to) p.last_contact_before = filters.last_contact_to;
    if (filters.created_from) p.created_after = filters.created_from;
    if (filters.created_to) p.created_before = filters.created_to;
    if (filters.tags && filters.tags.length) p.tags = filters.tags.join(',');
    if (filters.email_contains.trim()) p.email_contains = filters.email_contains.trim();
    if (filters.phone_contains.trim()) p.phone_contains = filters.phone_contains.trim();
    if (filters.company_name.trim()) p.company_name = filters.company_name.trim();
    if (filters.company_industry.trim()) p.company_industry = filters.company_industry.trim();
    if (filters.company_type) p.company_type = filters.company_type;
    if (filters.company_lifecycle_stage) p.company_lifecycle_stage = filters.company_lifecycle_stage;
    if (filters.company_lead_status) p.company_lead_status = filters.company_lead_status;
    if (filters.company_owner.trim()) p.company_owner = filters.company_owner.trim();
    if (filters.company_city.trim()) p.company_city = filters.company_city.trim();
    if (filters.company_state.trim()) p.company_state = filters.company_state.trim();
    if (filters.company_postal_code.trim()) p.company_postal_code = filters.company_postal_code.trim();
    if (filters.company_timezone) p.company_timezone = filters.company_timezone;
    if (filters.company_ad_spend) p.company_ad_spend = filters.company_ad_spend;
    if (filters.company_revenue_min) p.company_revenue_min = filters.company_revenue_min;
    if (filters.company_revenue_max) p.company_revenue_max = filters.company_revenue_max;
    if (filters.company_employee_min) p.company_employee_min = filters.company_employee_min;
    if (filters.company_employee_max) p.company_employee_max = filters.company_employee_max;
    return p;
  }, [tab, search, filters, sort, page, perPage, me]);

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
  useEffect(() => { api.get('/tags').then(setAllTags).catch(() => {}); }, []);

  useEffect(() => {
    const close = (e) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target)) setShowColumns(false);
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setShowAddMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const refreshAll = () => { load(); loadFacets(); };

  const captureState = () => ({ tab, search, filters, sort });
  const applyState = (s) => {
    if (s.tab) setTab(s.tab);
    setSearch(s.search || '');
    setFilters(s.filters || BLANK_FILTERS);
    if (s.sort) setSort(s.sort);
    setPage(0);
    setSearchKey((k) => k + 1);
  };

  const onSearch = (value) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(0); setSearch(value); }, 300);
  };

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
          <button className="link-btn name-link" onClick={(e) => { e.stopPropagation(); navigate(`/contacts/${c.id}`); }}>
            {c.name}
          </button>
        );
      case 'email':
        return c.email ? <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a> : '--';
      case 'phone': {
        const ph = c.phone_direct || c.phone_cell || c.phone;
        return ph ? <PhoneLink phone={ph} contactId={c.id} companyId={c.company_id} contactName={c.name} /> : '--';
      }
      case 'first_name': return c.first_name || '--';
      case 'last_name': return c.last_name || '--';
      case 'email_2': return c.email_2 ? <a href={`mailto:${c.email_2}`} onClick={(e) => e.stopPropagation()}>{c.email_2}</a> : '--';
      case 'phone_direct': return c.phone_direct ? <PhoneLink phone={c.phone_direct} contactId={c.id} companyId={c.company_id} contactName={c.name} /> : '--';
      case 'phone_cell': return c.phone_cell ? <PhoneLink phone={c.phone_cell} contactId={c.id} companyId={c.company_id} contactName={c.name} /> : '--';
      case 'phone_other': return c.phone_other ? <PhoneLink phone={c.phone_other} contactId={c.id} companyId={c.company_id} contactName={c.name} /> : '--';
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
            {meta.lead_statuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        );
      case 'source': return c.source || '--';
      case 'created_at': return fmtDate(c.created_at);
      default: return null;
    }
  };

  // Per-section active counts
  const sectionCounts = {
    details: [filters.source, filters.title, filters.has_email, filters.has_phone, filters.email_contains, filters.phone_contains].filter(Boolean).length,
    ownership: [filters.owner, filters.unassigned].filter(Boolean).length,
    leadStatus: filters.lead_statuses.length > 0 ? 1 : 0,
    activity: [filters.never_contacted, filters.inactive_days, filters.last_contact_from, filters.last_contact_to].filter(Boolean).length,
    createDate: [filters.created_from, filters.created_to].filter(Boolean).length,
    tags: filters.tags.length > 0 ? 1 : 0,
    company: [
      filters.company_name, filters.company_industry, filters.company_type,
      filters.company_lifecycle_stage, filters.company_lead_status, filters.company_owner,
      filters.company_city, filters.company_state, filters.company_postal_code, filters.company_timezone,
      filters.company_ad_spend, filters.company_revenue_min, filters.company_revenue_max,
      filters.company_employee_min, filters.company_employee_max,
    ].filter(Boolean).length,
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
          <SavedViews entity="contact" captureState={captureState} applyState={applyState} />
        </div>
        <div ref={addMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button className="btn primary" onClick={() => setShowAddMenu((v) => !v)}>
            Add contacts ▾
          </button>
          {showAddMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 200, minWidth: 160,
              background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: '4px 0'
            }}>
              <div style={{ padding: '8px 16px', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = ''}
                onClick={() => { setShowAdd(true); setShowAddMenu(false); }}
              >Add contact</div>
              <div style={{ padding: '8px 16px', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = ''}
                onClick={() => { navigate('/import'); setShowAddMenu(false); }}
              >Import contacts</div>
            </div>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <input
          key={searchKey}
          className="filter-search"
          placeholder="Search name, email or phone…"
          defaultValue={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <button className="btn small" onClick={() => setShowFilters(true)}>
          ⚙ Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
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

      {selected.size > 0 && (
        <div className="bulk-bar">
          <b>{selected.size} selected</b>
          <button className="btn small" onClick={bulkAssign}>Assign owner</button>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            <option value="">Set lead status…</option>
            {meta.lead_statuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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
              <tr key={c.id} className="row-link" onClick={() => navigate(`/contacts/${c.id}`)}>
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

      {showFilters && (
        <FilterDrawer
          title="Filter contacts"
          activeCount={activeFilterCount}
          onClose={() => setShowFilters(false)}
          onClear={() => { setFilters(BLANK_FILTERS); setPage(0); }}
        >
          <FilterSection title="Contact details" activeCount={sectionCounts.details}>
            <div className="fd-field">
              <label>Title</label>
              <input value={filters.title} onChange={(e) => setF({ title: e.target.value })} placeholder="e.g. Service Manager" />
            </div>
            <div className="fd-field">
              <label>Source</label>
              <input value={filters.source} onChange={(e) => setF({ source: e.target.value })} placeholder="e.g. Website" />
            </div>
            <div className="fd-field">
              <label>Email contains</label>
              <input value={filters.email_contains} onChange={(e) => setF({ email_contains: e.target.value })} placeholder="e.g. @gmail.com" />
            </div>
            <label className="fd-checkbox">
              <input type="checkbox" checked={filters.has_email} onChange={(e) => setF({ has_email: e.target.checked })} />
              Has email
            </label>
            <div className="fd-field">
              <label>Phone contains</label>
              <input value={filters.phone_contains} onChange={(e) => setF({ phone_contains: e.target.value })} placeholder="e.g. 404" />
            </div>
            <label className="fd-checkbox">
              <input type="checkbox" checked={filters.has_phone} onChange={(e) => setF({ has_phone: e.target.checked })} />
              Has phone
            </label>
          </FilterSection>

          <FilterSection title="Ownership" activeCount={sectionCounts.ownership}>
            <div className="fd-field">
              <label>Owner</label>
              <select value={filters.owner} onChange={(e) => setF({ owner: e.target.value })}>
                <option value="">Any owner</option>
                {facets.owners.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <label className="fd-checkbox">
              <input type="checkbox" checked={filters.unassigned} onChange={(e) => setF({ unassigned: e.target.checked })} />
              Unassigned only
            </label>
          </FilterSection>

          <FilterSection title="Company" activeCount={sectionCounts.company}>
            <div className="fd-field">
              <label>Company name contains</label>
              <input value={filters.company_name} onChange={(e) => setF({ company_name: e.target.value })} placeholder="e.g. Acme HVAC" />
            </div>
            <div className="fd-field">
              <label>Industry</label>
              <input value={filters.company_industry} onChange={(e) => setF({ company_industry: e.target.value })} placeholder="e.g. HVAC" />
            </div>
            <div className="fd-field">
              <label>Type</label>
              <select value={filters.company_type} onChange={(e) => setF({ company_type: e.target.value })}>
                <option value="">Any type</option>
                {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fd-field">
              <label>Lifecycle stage</label>
              <select value={filters.company_lifecycle_stage} onChange={(e) => setF({ company_lifecycle_stage: e.target.value })}>
                <option value="">Any stage</option>
                {meta.lifecycle_stages.map((s) => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="fd-field">
              <label>Lead status</label>
              <select value={filters.company_lead_status} onChange={(e) => setF({ company_lead_status: e.target.value })}>
                <option value="">Any status</option>
                <option value="New">New</option>
                <option value="Working">Working</option>
                <option value="Open">Open</option>
                <option value="Qualified">Qualified</option>
                <option value="Unqualified">Unqualified</option>
                <option value="Attempted to Contact">Attempted to Contact</option>
                <option value="Connected">Connected</option>
                <option value="Bad Timing">Bad Timing</option>
              </select>
            </div>
            <div className="fd-field">
              <label>Owner</label>
              <input value={filters.company_owner} onChange={(e) => setF({ company_owner: e.target.value })} placeholder="e.g. Curt" />
            </div>
            <div className="fd-field">
              <label>City</label>
              <input value={filters.company_city} onChange={(e) => setF({ company_city: e.target.value })} placeholder="e.g. Atlanta" />
            </div>
            <div className="fd-field">
              <label>State</label>
              <input value={filters.company_state} onChange={(e) => setF({ company_state: e.target.value })} placeholder="e.g. GA" />
            </div>
            <div className="fd-field">
              <label>Postal code</label>
              <input value={filters.company_postal_code} onChange={(e) => setF({ company_postal_code: e.target.value })} placeholder="e.g. 30301" />
            </div>
            <div className="fd-field">
              <label>Timezone</label>
              <select value={filters.company_timezone} onChange={(e) => setF({ company_timezone: e.target.value })}>
                <option value="">Any timezone</option>
                {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
            <div className="fd-field">
              <label>Google ad spend</label>
              <select value={filters.company_ad_spend} onChange={(e) => setF({ company_ad_spend: e.target.value })}>
                <option value="">Any spend</option>
                {meta.ad_spend_ranges.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="fd-field">
              <label>Annual revenue</label>
              <div className="fd-range">
                <input type="number" placeholder="Min" value={filters.company_revenue_min} onChange={(e) => setF({ company_revenue_min: e.target.value })} />
                <input type="number" placeholder="Max" value={filters.company_revenue_max} onChange={(e) => setF({ company_revenue_max: e.target.value })} />
              </div>
            </div>
            <div className="fd-field">
              <label>Employees</label>
              <div className="fd-range">
                <input type="number" placeholder="Min" value={filters.company_employee_min} onChange={(e) => setF({ company_employee_min: e.target.value })} />
                <input type="number" placeholder="Max" value={filters.company_employee_max} onChange={(e) => setF({ company_employee_max: e.target.value })} />
              </div>
            </div>
          </FilterSection>

          <FilterSection title="Lead status" activeCount={sectionCounts.leadStatus}>
            {LEAD_STATUSES.map((s) => (
              <label key={s} className="fd-checkbox">
                <input
                  type="checkbox"
                  checked={filters.lead_statuses.includes(s.toLowerCase())}
                  onChange={(e) => {
                    const val = s.toLowerCase();
                    const next = e.target.checked
                      ? [...filters.lead_statuses, val]
                      : filters.lead_statuses.filter((x) => x !== val);
                    setF({ lead_statuses: next });
                  }}
                />
                {s}
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Activity" activeCount={sectionCounts.activity}>
            <label className="fd-checkbox">
              <input type="checkbox" checked={filters.never_contacted} onChange={(e) => setF({ never_contacted: e.target.checked })} />
              Never contacted
            </label>
            <div className="fd-field">
              <label>Inactive days</label>
              <select value={filters.inactive_days} onChange={(e) => setF({ inactive_days: e.target.value })}>
                <option value="">Any</option>
                <option value="7">7+ days inactive</option>
                <option value="14">14+ days inactive</option>
                <option value="30">30+ days inactive</option>
              </select>
            </div>
            <div className="fd-field">
              <label>Last contacted from</label>
              <input type="date" value={filters.last_contact_from} onChange={(e) => setF({ last_contact_from: e.target.value })} />
            </div>
            <div className="fd-field">
              <label>Last contacted to</label>
              <input type="date" value={filters.last_contact_to} onChange={(e) => setF({ last_contact_to: e.target.value })} />
            </div>
          </FilterSection>

          <FilterSection title="Create date" activeCount={sectionCounts.createDate}>
            <div className="fd-field">
              <label>Created from</label>
              <input type="date" value={filters.created_from} onChange={(e) => setF({ created_from: e.target.value })} />
            </div>
            <div className="fd-field">
              <label>Created to</label>
              <input type="date" value={filters.created_to} onChange={(e) => setF({ created_to: e.target.value })} />
            </div>
          </FilterSection>

          <FilterSection title="Tags" activeCount={sectionCounts.tags}>
            {allTags.map((t) => (
              <label key={t.id} className="fd-checkbox">
                <input
                  type="checkbox"
                  checked={filters.tags.includes(t.name)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...filters.tags, t.name] : filters.tags.filter((x) => x !== t.name);
                    setF({ tags: next });
                  }}
                />
                {t.name}
              </label>
            ))}
            {allTags.length === 0 && <span className="muted small">No tags yet</span>}
          </FilterSection>
        </FilterDrawer>
      )}

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
