import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useStore, LIFECYCLE_LABELS } from '../store.js';
import Modal from '../components/Modal.jsx';
import CompanyBoard from '../components/CompanyBoard.jsx';
import { PreviewPanel, SummaryPanel, EmailComposer, NoteComposer } from '../components/CompanyActions.jsx';
import EnrollModal from '../components/EnrollModal.jsx';
import SavedViews from '../components/SavedViews.jsx';
import { Field, StageChip } from '../components/widgets.jsx';
import { fmtDate, fmtDateTime, fmtMoney, relTime } from '../format.js';
import FilterDrawer, { FilterSection } from '../components/FilterDrawer.jsx';
import {
  BUYING_COMMITTEE_LABELS,
  LAST_TOUCH_CHANNELS,
  TARGET_TIER_LABELS,
  isSuppressed,
  suppressionText,
} from '../prospecting.js';
import { bulkCompanyDeleteConfirmation, downloadBackupSnapshot } from '../dataSafety.js';

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
  owner: '', unassigned: false, lifecycle_stage: '',
  target_tier: '', source: '', campaign: '', buying_committee_status: '',
  suppressed: '', needs_next_action: false,
  industry: '', type: '', city: '', state: '', postal_code: '', timezone: '',
  ad_spend_range: '', employee_min: '', employee_max: '',
  revenue_min: '', revenue_max: '',
  deal_stage: '', no_deals: false,
  inactive_days: '',
  last_activity_from: '', last_activity_to: '',
  created_from: '', created_to: '',
  tags: [],
  lead_status: '',
  has_phone: false,
  description: '',
  domain: '',
  contact_min: '', contact_max: '',
  pipeline_min: '', pipeline_max: '',
  task_min: '', task_max: '',
};

export function CompanyForm({ initial = {}, onSubmit, submitLabel = 'Save' }) {
  const { meta } = useStore();
  const [form, setForm] = useState({
    website: '', name: '', phone: '', industry: 'HVAC', type: '', city: '', state: '',
    postal_code: '', employee_count: '', annual_revenue: '', ad_spend_range: '',
    timezone: '', description: '', owner: '', lifecycle_stage: 'lead',
    target_tier: '', source: '', campaign: '', last_touch_channel: '', next_step: '',
    buying_committee_status: 'unknown', do_not_contact: false, replied: false,
    not_interested: false, bad_fit: false, suppression_reason: '', ...initial,
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const chk = (k) => (e) => setForm({ ...form, [k]: e.target.checked });

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...form,
          employee_count: form.employee_count === '' ? null : Number(form.employee_count),
          annual_revenue: form.annual_revenue === '' ? null : Number(form.annual_revenue),
        });
      }}
    >
      <Field label="Company website"><input value={form.website || ''} onChange={upd('website')} placeholder="https://acmehvac.com" /></Field>
      <Field label="Company name"><input value={form.name} onChange={upd('name')} /></Field>
      <Field label="Company phone"><input value={form.phone || ''} onChange={upd('phone')} placeholder="+1 (215) 555-0100" /></Field>
      <Field label="Industry"><input value={form.industry || ''} onChange={upd('industry')} /></Field>
      <Field label="City"><input value={form.city || ''} onChange={upd('city')} /></Field>
      <Field label="State"><input value={form.state || ''} onChange={upd('state')} /></Field>
      <Field label="Postal code"><input value={form.postal_code || ''} onChange={upd('postal_code')} /></Field>
      <Field label="Number of employees"><input type="number" min="0" value={form.employee_count ?? ''} onChange={upd('employee_count')} /></Field>
      <Field label="Annual revenue"><input type="number" min="0" value={form.annual_revenue ?? ''} onChange={upd('annual_revenue')} placeholder="0" /></Field>
      <Field label="Google ad spend">
        <select value={form.ad_spend_range || ''} onChange={upd('ad_spend_range')}>
          <option value="">—</option>
          {meta.ad_spend_ranges.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Target tier">
        <select value={form.target_tier || ''} onChange={upd('target_tier')}>
          <option value="">--</option>
          {meta.target_tiers.map((t) => <option key={t} value={t}>{TARGET_TIER_LABELS[t] || t}</option>)}
        </select>
      </Field>
      <Field label="Source"><input value={form.source || ''} onChange={upd('source')} placeholder="Apollo, referral, Google search..." /></Field>
      <Field label="Campaign"><input value={form.campaign || ''} onChange={upd('campaign')} placeholder="June HVAC owners" /></Field>
      <Field label="Buying committee">
        <select value={form.buying_committee_status || 'unknown'} onChange={upd('buying_committee_status')}>
          {meta.buying_committee_statuses.map((s) => <option key={s} value={s}>{BUYING_COMMITTEE_LABELS[s] || s}</option>)}
        </select>
      </Field>
      <Field label="Last touch channel">
        <select value={form.last_touch_channel || ''} onChange={upd('last_touch_channel')}>
          <option value="">--</option>
          {LAST_TOUCH_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Next step" style={{ gridColumn: '1 / -1' }}>
        <input value={form.next_step || ''} onChange={upd('next_step')} placeholder="Call owner, find ops manager, send audit invite..." />
      </Field>
      <div className="form-grid-wide suppression-fields">
        <label><input type="checkbox" checked={!!form.replied} onChange={chk('replied')} /> Replied</label>
        <label><input type="checkbox" checked={!!form.do_not_contact} onChange={chk('do_not_contact')} /> Do not contact</label>
        <label><input type="checkbox" checked={!!form.not_interested} onChange={chk('not_interested')} /> Not interested</label>
        <label><input type="checkbox" checked={!!form.bad_fit} onChange={chk('bad_fit')} /> Bad fit</label>
      </div>
      {(form.do_not_contact || form.not_interested || form.bad_fit) && (
        <Field label="Suppression reason" style={{ gridColumn: '1 / -1' }}>
          <input value={form.suppression_reason || ''} onChange={upd('suppression_reason')} placeholder="Owner declined, asked to stop, bad market fit..." />
        </Field>
      )}
      <Field label="Time zone">
        <select value={form.timezone || ''} onChange={upd('timezone')}>
          <option value="">—</option>
          {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
        </select>
      </Field>
      <Field label="Description" style={{ gridColumn: '1 / -1' }}>
        <textarea value={form.description || ''} onChange={upd('description')} rows={3} style={{ width: '100%' }} />
      </Field>
      <div className="form-actions"><button className="btn primary" type="submit">{submitLabel}</button></div>
    </form>
  );
}

const ALL_COLUMNS = [
  { key: 'name', label: 'Company name', sort: 'name', always: true },
  { key: 'owner', label: 'Company owner', sort: 'owner' },
  { key: 'target_tier', label: 'Target Tier', sort: 'target_tier' },
  { key: 'buying_committee_status', label: 'Committee', sort: 'buying_committee_status' },
  { key: 'next_step', label: 'Next Step' },
  { key: 'suppression', label: 'Suppression' },
  { key: 'source', label: 'Source' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'created_at', label: 'Create Date', sort: 'created_at' },
  { key: 'last_activity_at', label: 'Last Activity Date', sort: 'last_activity_at' },
  { key: 'lifecycle_stage', label: 'Lifecycle Stage', sort: 'lifecycle_stage' },
  { key: 'industry', label: 'Industry' },
  { key: 'type', label: 'Type' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postal Code' },
  { key: 'employee_count', label: 'Employees', sort: 'employee_count' },
  { key: 'annual_revenue', label: 'Annual Revenue' },
  { key: 'ad_spend_range', label: 'Google Ad Spend' },
  { key: 'timezone', label: 'Time Zone' },
  { key: 'contact_count', label: 'Contacts' },
  { key: 'open_deal_value', label: 'Open Pipeline' },
  { key: 'latest_deal_stage', label: 'Deal Stage' },
  { key: 'open_task_count', label: 'Open Tasks' },
];
const DEFAULT_VISIBLE = ['name', 'owner', 'target_tier', 'buying_committee_status', 'next_step', 'suppression', 'last_activity_at', 'contact_count'];

function BulkEnrollModal({ count, onClose, onEnroll }) {
  const [sequences, setSequences] = useState([]);
  const [sequenceId, setSequenceId] = useState('');
  useEffect(() => {
    api.get('/sequences').then((rows) => setSequences(rows.filter((s) => s.active && s.step_count > 0))).catch(() => {});
  }, []);
  return (
    <Modal title={`Enroll ${count} compan${count === 1 ? 'y' : 'ies'} in a sequence`} onClose={onClose}>
      <Field label="Sequence">
        <select value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
          <option value="">Choose a sequence…</option>
          {sequences.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.step_count} steps)</option>)}
        </select>
      </Field>
      <p className="muted small">Each company is enrolled without a specific contact, so auto-email steps need a contact added later. Already-enrolled companies are skipped.</p>
      <div className="form-actions pad-top">
        <button className="btn primary" disabled={!sequenceId} onClick={() => onEnroll(sequenceId)}>Enroll {count}</button>
      </div>
    </Modal>
  );
}

export default function Companies() {
  const { run, meta, notify } = useStore();
  const me = localStorage.getItem('crm_display_name') || 'Curt';
  const navigate = useNavigate();

  const [view, setView] = useState(() => localStorage.getItem('crm_company_view') || 'table');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [allTags, setAllTags] = useState([]);
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
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);
  const [panel, setPanel] = useState(null);
  const [composer, setComposer] = useState(null);
  const [enroll, setEnroll] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkEnroll, setBulkEnroll] = useState(false);
  const [bulkLifecycle, setBulkLifecycle] = useState('');
  const [searchKey, setSearchKey] = useState(0);
  const searchTimer = useRef(null);
  const colPanelRef = useRef(null);

  const setF = (patch) => { setPage(0); setFilters((f) => ({ ...f, ...patch })); };

  const activeFilterCount = useMemo(() => [
    filters.owner, filters.unassigned, filters.lifecycle_stage,
    filters.target_tier, filters.source, filters.campaign, filters.buying_committee_status,
    filters.suppressed, filters.needs_next_action,
    filters.industry, filters.type, filters.city, filters.state, filters.postal_code, filters.timezone,
    filters.ad_spend_range, filters.employee_min, filters.employee_max,
    filters.revenue_min, filters.revenue_max,
    filters.deal_stage, filters.no_deals,
    filters.inactive_days, filters.last_activity_from, filters.last_activity_to,
    filters.created_from, filters.created_to,
    filters.tags.length > 0,
    filters.lead_status, filters.has_phone, filters.description, filters.domain,
    filters.contact_min, filters.contact_max,
    filters.pipeline_min, filters.pipeline_max,
    filters.task_min, filters.task_max,
  ].filter(Boolean).length, [filters]);

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
    if (filters.unassigned) p.unassigned = 'true';
    if (filters.lifecycle_stage) p.lifecycle_stage = filters.lifecycle_stage;
    if (filters.target_tier) p.target_tier = filters.target_tier;
    if (filters.source.trim()) p.source = filters.source.trim();
    if (filters.campaign.trim()) p.campaign = filters.campaign.trim();
    if (filters.buying_committee_status) p.buying_committee_status = filters.buying_committee_status;
    if (filters.suppressed) p.suppressed = filters.suppressed;
    if (filters.needs_next_action) p.needs_next_action = 'true';
    if (filters.industry) p.industry = filters.industry;
    if (filters.type) p.type = filters.type;
    if (filters.city) p.city = filters.city;
    if (filters.state) p.state = filters.state;
    if (filters.postal_code) p.postal_code = filters.postal_code;
    if (filters.timezone) p.timezone = filters.timezone;
    if (filters.ad_spend_range) p.ad_spend_range = filters.ad_spend_range;
    if (filters.employee_min) p.employee_min = filters.employee_min;
    if (filters.employee_max) p.employee_max = filters.employee_max;
    if (filters.revenue_min) p.revenue_min = filters.revenue_min;
    if (filters.revenue_max) p.revenue_max = filters.revenue_max;
    if (filters.deal_stage) p.deal_stage = filters.deal_stage;
    if (filters.no_deals) p.no_deals = 'true';
    if (filters.inactive_days) p.inactive_days = filters.inactive_days;
    if (filters.last_activity_from) p.last_contact_after = filters.last_activity_from;
    if (filters.last_activity_to) p.last_contact_before = filters.last_activity_to;
    if (filters.created_from) p.created_after = filters.created_from;
    if (filters.created_to) p.created_before = filters.created_to;
    if (filters.tags && filters.tags.length) p.tags = filters.tags.join(',');
    if (filters.lead_status) p.lead_status = filters.lead_status;
    if (filters.has_phone) p.has_phone = 'true';
    if (filters.description.trim()) p.description = filters.description.trim();
    if (filters.domain.trim()) p.domain = filters.domain.trim();
    if (filters.contact_min) p.contact_min = filters.contact_min;
    if (filters.contact_max) p.contact_max = filters.contact_max;
    if (filters.pipeline_min) p.pipeline_min = filters.pipeline_min;
    if (filters.pipeline_max) p.pipeline_max = filters.pipeline_max;
    if (filters.task_min) p.task_min = filters.task_min;
    if (filters.task_max) p.task_max = filters.task_max;
    return p;
  }, [view, tab, search, filters, sort, page, perPage, me]);

  const load = () => {
    api.get(`/companies${qs(params)}`).then((d) => { setData(d); setSelected(new Set()); }).catch((e) => notify(e.message, true));
  };

  const captureState = () => ({ tab, search, filters, sort, view });
  const applyState = (s) => {
    if (s.tab) setTab(s.tab);
    setSearch(s.search || '');
    setFilters(s.filters || BLANK_FILTERS);
    if (s.sort) setSort(s.sort);
    if (s.view) switchView(s.view);
    setPage(0);
    setSearchKey((k) => k + 1);
  };

  const loadFacets = () => {
    api.get(`/companies/facets?me=${encodeURIComponent(me)}`).then(setFacets).catch(() => {});
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

  const switchView = (v) => {
    localStorage.setItem('crm_company_view', v);
    setView(v);
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
    else if (type === 'sequence') setEnroll(company);
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

  const allSelected = data.companies.length > 0 && data.companies.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(data.companies.map((c) => c.id)));
  const toggleOne = (id) => setSelected((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const bulk = (action, patch, extra = {}) =>
    run(async () => {
      await api.post('/companies/bulk', { ids: [...selected], action, patch, ...extra });
      refreshAll();
    }, action === 'delete' ? 'Companies deleted' : 'Companies updated');

  const bulkAssign = () => {
    const owner = prompt(`Assign owner for ${selected.size} compan${selected.size === 1 ? 'y' : 'ies'}:`, me);
    if (owner !== null) bulk('update', { owner: owner.trim() });
  };
  const bulkDelete = () => {
    const phrase = bulkCompanyDeleteConfirmation(selected.size);
    const entered = prompt(
      `This permanently deletes ${selected.size} compan${selected.size === 1 ? 'y' : 'ies'} and all related records.\n\nA backup will download first.\n\nType ${phrase} to continue:`
    );
    if (entered === null) return;
    if (entered.trim() !== phrase) {
      notify('Delete canceled: confirmation did not match', true);
      return;
    }
    run(async () => {
      await downloadBackupSnapshot();
      await api.post('/companies/bulk', { ids: [...selected], action: 'delete', confirm: phrase });
      refreshAll();
    }, 'Companies deleted');
  };
  const doBulkEnroll = (sequenceId) =>
    run(async () => {
      const results = await Promise.allSettled(
        [...selected].map((id) => api.post(`/sequences/${sequenceId}/enroll`, { company_id: id, owner: me }))
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      notify(`Enrolled ${ok} of ${selected.size} companies`);
      setBulkEnroll(false);
      refreshAll();
    }, null);

  const cell = (c, col) => {
    switch (col.key) {
      case 'name':
        return (
          <>
            <Link to={`/companies/${c.id}`} onClick={(e) => e.stopPropagation()} className="company-link">{c.name}</Link>
            {c.domain && <div className="muted small">{c.domain}</div>}
            {isSuppressed(c) && <div className="chip danger-chip">Suppressed</div>}
          </>
        );
      case 'owner': return c.owner || <span className="muted">No owner</span>;
      case 'target_tier': return c.target_tier ? <span className="chip tier-chip">{TARGET_TIER_LABELS[c.target_tier] || c.target_tier}</span> : '--';
      case 'buying_committee_status': return BUYING_COMMITTEE_LABELS[c.buying_committee_status] || c.buying_committee_status || '--';
      case 'next_step': return c.next_step || <span className="muted">Missing</span>;
      case 'suppression':
        return isSuppressed(c) ? <span className="chip danger-chip">{suppressionText(c)}</span> : <span className="chip ok-chip">Eligible</span>;
      case 'source': return c.source || '--';
      case 'campaign': return c.campaign || '--';
      case 'created_at': return fmtDate(c.created_at);
      case 'last_activity_at': return c.last_activity_at ? fmtDateTime(c.last_activity_at) : '--';
      case 'lifecycle_stage': return <span className="chip lifecycle">{LIFECYCLE_LABELS[c.lifecycle_stage] || c.lifecycle_stage}</span>;
      case 'industry': return c.industry || '--';
      case 'type': return c.type || '--';
      case 'city': return c.city || '--';
      case 'state': return c.state || '--';
      case 'postal_code': return c.postal_code || '--';
      case 'employee_count': return c.employee_count ?? '--';
      case 'annual_revenue': return c.annual_revenue ? fmtMoney(c.annual_revenue) : '--';
      case 'ad_spend_range': return c.ad_spend_range || '--';
      case 'timezone': return c.timezone || '--';
      case 'contact_count': return c.contact_count;
      case 'open_deal_value': return Number(c.open_deal_value) > 0 ? fmtMoney(c.open_deal_value) : '--';
      case 'latest_deal_stage': return <StageChip stage={c.latest_deal_stage} />;
      case 'open_task_count': return c.open_task_count > 0 ? c.open_task_count : '--';
      default: return null;
    }
  };

  // Per-section active counts
  const sectionCounts = {
    companyInfo: [filters.industry, filters.type, filters.city, filters.state, filters.postal_code, filters.timezone, filters.domain, filters.description, filters.has_phone].filter(Boolean).length,
    ownership: [filters.owner, filters.unassigned, filters.lead_status].filter(Boolean).length,
    prospecting: [
      filters.target_tier, filters.source, filters.campaign, filters.buying_committee_status,
      filters.suppressed, filters.needs_next_action,
    ].filter(Boolean).length,
    lifecycle: filters.lifecycle_stage ? 1 : 0,
    financial: [filters.revenue_min, filters.revenue_max, filters.ad_spend_range].filter(Boolean).length,
    size: [filters.employee_min, filters.employee_max].filter(Boolean).length,
    deals: [filters.deal_stage, filters.no_deals, filters.pipeline_min, filters.pipeline_max].filter(Boolean).length,
    activity: [filters.inactive_days, filters.last_activity_from, filters.last_activity_to].filter(Boolean).length,
    createDate: [filters.created_from, filters.created_to].filter(Boolean).length,
    tags: filters.tags.length > 0 ? 1 : 0,
    contactsAndTasks: [filters.contact_min, filters.contact_max, filters.task_min, filters.task_max].filter(Boolean).length,
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
          <SavedViews entity="company" captureState={captureState} applyState={applyState} />
        </div>
        <div className="add-menu-wrap" ref={addMenuRef} style={{ position: 'relative' }}>
          <button className="btn primary" onClick={() => setShowAddMenu((v) => !v)}>
            Add companies ▾
          </button>
          {showAddMenu && (
            <div className="col-panel" style={{ right: 0, left: 'auto', minWidth: 160 }}>
              <button className="col-panel-item" onClick={() => { setShowAdd(true); setShowAddMenu(false); }}>
                + Add company
              </button>
              <button className="col-panel-item" onClick={() => { navigate('/import'); setShowAddMenu(false); }}>
                📥 Import companies
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <input
          key={searchKey}
          className="filter-search"
          placeholder="Search name or domain…"
          defaultValue={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <span className="toggle-group">
          <button className={view === 'table' ? 'on' : ''} onClick={() => switchView('table')}>☷ Table view</button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => switchView('board')}>▦ Board view</button>
        </span>
        <button className="btn small" onClick={() => setShowFilters(true)}>
          ⚙ Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
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

      {view === 'table' && selected.size > 0 && (
        <div className="bulk-bar">
          <b>{selected.size} selected</b>
          <button className="btn small" onClick={bulkAssign}>Assign owner</button>
          <select value={bulkLifecycle} onChange={(e) => setBulkLifecycle(e.target.value)}>
            <option value="">Set lifecycle…</option>
            {meta.lifecycle_stages.map((s) => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
          </select>
          {bulkLifecycle && (
            <button className="btn small primary" onClick={() => { bulk('update', { lifecycle_stage: bulkLifecycle }); setBulkLifecycle(''); }}>Apply</button>
          )}
          <button className="btn small" onClick={() => setBulkEnroll(true)}>Enroll in sequence</button>
          <button className="btn small danger" onClick={bulkDelete}>Delete</button>
          <button className="link-btn" onClick={() => setSelected(new Set())}>Clear</button>
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
                  <th className="check-col"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
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
                    <td className="check-col" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
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
                  <tr><td colSpan={cols.length + 2} className="muted center">No companies match. Add one or import a prospect list.</td></tr>
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

      {showFilters && (
        <FilterDrawer
          title="Filter companies"
          activeCount={activeFilterCount}
          onClose={() => setShowFilters(false)}
          onClear={() => { setFilters(BLANK_FILTERS); setPage(0); }}
        >
          <FilterSection title="Company information" activeCount={sectionCounts.companyInfo}>
            <div className="fd-field">
              <label>Industry</label>
              <input value={filters.industry} onChange={(e) => setF({ industry: e.target.value })} placeholder="e.g. HVAC" />
            </div>
            <div className="fd-field">
              <label>Type</label>
              <select value={filters.type} onChange={(e) => setF({ type: e.target.value })}>
                <option value="">Any type</option>
                {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fd-field">
              <label>Domain contains</label>
              <input value={filters.domain} onChange={(e) => setF({ domain: e.target.value })} placeholder="e.g. acmehvac.com" />
            </div>
            <div className="fd-field">
              <label>Description contains</label>
              <input value={filters.description} onChange={(e) => setF({ description: e.target.value })} placeholder="keyword in description" />
            </div>
            <div className="fd-field">
              <label>City</label>
              <input value={filters.city} onChange={(e) => setF({ city: e.target.value })} placeholder="e.g. Atlanta" />
            </div>
            <div className="fd-field">
              <label>State</label>
              <input value={filters.state} onChange={(e) => setF({ state: e.target.value })} placeholder="e.g. GA" />
            </div>
            <div className="fd-field">
              <label>Postal code</label>
              <input value={filters.postal_code} onChange={(e) => setF({ postal_code: e.target.value })} placeholder="e.g. 30301" />
            </div>
            <div className="fd-field">
              <label>Timezone</label>
              <select value={filters.timezone} onChange={(e) => setF({ timezone: e.target.value })}>
                <option value="">Any timezone</option>
                {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
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
            <div className="fd-field">
              <label>Lead status</label>
              <select value={filters.lead_status} onChange={(e) => setF({ lead_status: e.target.value })}>
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
          </FilterSection>

          <FilterSection title="Prospecting" activeCount={sectionCounts.prospecting}>
            <div className="fd-field">
              <label>Target tier</label>
              <select value={filters.target_tier} onChange={(e) => setF({ target_tier: e.target.value })}>
                <option value="">Any tier</option>
                {meta.target_tiers.map((t) => <option key={t} value={t}>{TARGET_TIER_LABELS[t] || t}</option>)}
              </select>
            </div>
            <div className="fd-field">
              <label>Buying committee</label>
              <select value={filters.buying_committee_status} onChange={(e) => setF({ buying_committee_status: e.target.value })}>
                <option value="">Any status</option>
                {meta.buying_committee_statuses.map((s) => <option key={s} value={s}>{BUYING_COMMITTEE_LABELS[s] || s}</option>)}
              </select>
            </div>
            <div className="fd-field">
              <label>Source contains</label>
              <input value={filters.source} onChange={(e) => setF({ source: e.target.value })} placeholder="Apollo, referral..." />
            </div>
            <div className="fd-field">
              <label>Campaign contains</label>
              <input value={filters.campaign} onChange={(e) => setF({ campaign: e.target.value })} placeholder="June HVAC owners" />
            </div>
            <div className="fd-field">
              <label>Suppression</label>
              <select value={filters.suppressed} onChange={(e) => setF({ suppressed: e.target.value })}>
                <option value="">Any</option>
                <option value="false">Eligible only</option>
                <option value="true">Suppressed only</option>
              </select>
            </div>
            <label className="fd-checkbox">
              <input type="checkbox" checked={filters.needs_next_action} onChange={(e) => setF({ needs_next_action: e.target.checked })} />
              Missing next step
            </label>
          </FilterSection>

          <FilterSection title="Lifecycle stage" activeCount={sectionCounts.lifecycle}>
            <div className="fd-field">
              <label>Stage</label>
              <select value={filters.lifecycle_stage} onChange={(e) => setF({ lifecycle_stage: e.target.value })}>
                <option value="">Any stage</option>
                {meta.lifecycle_stages.map((s) => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
              </select>
            </div>
          </FilterSection>

          <FilterSection title="Financial" activeCount={sectionCounts.financial}>
            <div className="fd-field">
              <label>Annual revenue</label>
              <div className="fd-range">
                <input type="number" placeholder="Min" value={filters.revenue_min} onChange={(e) => setF({ revenue_min: e.target.value })} />
                <input type="number" placeholder="Max" value={filters.revenue_max} onChange={(e) => setF({ revenue_max: e.target.value })} />
              </div>
            </div>
            <div className="fd-field">
              <label>Google ad spend</label>
              <select value={filters.ad_spend_range} onChange={(e) => setF({ ad_spend_range: e.target.value })}>
                <option value="">Any spend</option>
                {meta.ad_spend_ranges.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </FilterSection>

          <FilterSection title="Company size" activeCount={sectionCounts.size}>
            <div className="fd-field">
              <label>Employees</label>
              <div className="fd-range">
                <input type="number" placeholder="Min" value={filters.employee_min} onChange={(e) => setF({ employee_min: e.target.value })} />
                <input type="number" placeholder="Max" value={filters.employee_max} onChange={(e) => setF({ employee_max: e.target.value })} />
              </div>
            </div>
          </FilterSection>

          <FilterSection title="Deals" activeCount={sectionCounts.deals}>
            <div className="fd-field">
              <label>Deal stage</label>
              <select value={filters.deal_stage} onChange={(e) => setF({ deal_stage: e.target.value })}>
                <option value="">Any stage</option>
                {meta.stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <label className="fd-checkbox">
              <input type="checkbox" checked={filters.no_deals} onChange={(e) => setF({ no_deals: e.target.checked })} />
              No deals yet
            </label>
            <div className="fd-field">
              <label>Pipeline value ≥</label>
              <input type="number" placeholder="Min $" value={filters.pipeline_min} onChange={(e) => setF({ pipeline_min: e.target.value })} />
            </div>
            <div className="fd-field">
              <label>Pipeline value ≤</label>
              <input type="number" placeholder="Max $" value={filters.pipeline_max} onChange={(e) => setF({ pipeline_max: e.target.value })} />
            </div>
          </FilterSection>

          <FilterSection title="Contacts & Tasks" activeCount={sectionCounts.contactsAndTasks}>
            <div className="fd-field">
              <label>Contacts ≥</label>
              <input type="number" placeholder="Min contacts" value={filters.contact_min} onChange={(e) => setF({ contact_min: e.target.value })} />
            </div>
            <div className="fd-field">
              <label>Contacts ≤</label>
              <input type="number" placeholder="Max contacts" value={filters.contact_max} onChange={(e) => setF({ contact_max: e.target.value })} />
            </div>
            <div className="fd-field">
              <label>Open tasks ≥</label>
              <input type="number" placeholder="Min open tasks" value={filters.task_min} onChange={(e) => setF({ task_min: e.target.value })} />
            </div>
            <div className="fd-field">
              <label>Open tasks ≤</label>
              <input type="number" placeholder="Max open tasks" value={filters.task_max} onChange={(e) => setF({ task_max: e.target.value })} />
            </div>
          </FilterSection>

          <FilterSection title="Activity" activeCount={sectionCounts.activity}>
            <div className="fd-field">
              <label>Untouched days</label>
              <select value={filters.inactive_days} onChange={(e) => setF({ inactive_days: e.target.value })}>
                <option value="">Any</option>
                <option value="7">7+ days untouched</option>
                <option value="14">14+ days untouched</option>
                <option value="30">30+ days untouched</option>
              </select>
            </div>
            <div className="fd-field">
              <label>Last activity from</label>
              <input type="date" value={filters.last_activity_from} onChange={(e) => setF({ last_activity_from: e.target.value })} />
            </div>
            <div className="fd-field">
              <label>Last activity to</label>
              <input type="date" value={filters.last_activity_to} onChange={(e) => setF({ last_activity_to: e.target.value })} />
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

      {panel?.type === 'preview' && (
        <PreviewPanel
          company={panel.company}
          onClose={() => setPanel(null)}
          onChanged={refreshAll}
          onEmail={() => setComposer({ type: 'email', company: panel.company })}
          onNote={() => setComposer({ type: 'note', company: panel.company })}
          onSummary={() => setPanel({ type: 'summary', company: panel.company })}
          onSequence={() => setEnroll(panel.company)}
        />
      )}
      {enroll && <EnrollModal company={enroll} onClose={() => setEnroll(null)} onEnrolled={refreshAll} />}
      {bulkEnroll && (
        <BulkEnrollModal count={selected.size} onClose={() => setBulkEnroll(false)} onEnroll={doBulkEnroll} />
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
