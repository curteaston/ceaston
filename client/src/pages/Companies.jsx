import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store.js';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { Field, StageChip } from '../components/widgets.jsx';
import { fmtMoney, relTime } from '../format.js';

export function CompanyForm({ initial = {}, onSubmit, submitLabel = 'Save' }) {
  const { meta } = useStore();
  const [form, setForm] = useState({
    name: '', domain: '', industry: 'HVAC', employee_count: '',
    ad_spend_range: '', website: '', ...initial,
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
      <div className="form-actions"><button className="btn primary" type="submit">{submitLabel}</button></div>
    </form>
  );
}

export default function Companies() {
  const { companies, total, filters, setFilters, clearFilters, fetchCompanies, loadingCompanies, run, meta } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState(filters.q || '');
  const navigate = useNavigate();
  const searchTimer = useRef(null);

  useEffect(() => { fetchCompanies(); }, []);

  const onSearch = (value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilters({ q: value || undefined }), 300);
  };

  const createCompany = (form) =>
    run(async () => {
      const company = await api.post('/companies', form);
      setShowAdd(false);
      navigate(`/companies/${company.id}`);
    }, 'Company created');

  const activeFilterCount = ['industry', 'ad_spend_range', 'employee_min', 'employee_max', 'inactive_days', 'deal_stage', 'no_deals']
    .filter((k) => filters[k]).length;

  return (
    <div>
      <div className="page-head">
        <h1>Companies <span className="muted">({total})</span></h1>
        <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add company</button>
      </div>

      <div className="filter-bar">
        <input
          className="filter-search"
          placeholder="Search name or domain…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <input
          placeholder="Industry"
          style={{ width: 110 }}
          value={filters.industry || ''}
          onChange={(e) => setFilters({ industry: e.target.value || undefined })}
        />
        <select value={filters.ad_spend_range || ''} onChange={(e) => setFilters({ ad_spend_range: e.target.value || undefined })}>
          <option value="">Ad spend: any</option>
          {meta.ad_spend_ranges.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          type="number" placeholder="Emp ≥" style={{ width: 80 }}
          value={filters.employee_min || ''}
          onChange={(e) => setFilters({ employee_min: e.target.value || undefined })}
        />
        <input
          type="number" placeholder="Emp ≤" style={{ width: 80 }}
          value={filters.employee_max || ''}
          onChange={(e) => setFilters({ employee_max: e.target.value || undefined })}
        />
        <select value={filters.inactive_days || ''} onChange={(e) => setFilters({ inactive_days: e.target.value || undefined })}>
          <option value="">Last contact: any</option>
          <option value="7">Untouched 7+ days</option>
          <option value="14">Untouched 14+ days</option>
          <option value="30">Untouched 30+ days</option>
        </select>
        <select value={filters.deal_stage || ''} onChange={(e) => setFilters({ deal_stage: e.target.value || undefined })}>
          <option value="">Deal stage: any</option>
          {meta.stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={filters.no_deals === 'true'}
            onChange={(e) => setFilters({ no_deals: e.target.checked ? 'true' : undefined })}
          /> No deals yet
        </label>
        {(activeFilterCount > 0 || filters.q) && (
          <button className="link-btn" onClick={() => { setSearch(''); clearFilters(); }}>Clear filters</button>
        )}
      </div>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Company</th><th>Industry</th><th>Employees</th><th>Ad spend/mo</th>
              <th>Contacts</th><th>Open pipeline</th><th>Deal stage</th><th>Last activity</th><th>Tasks</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => navigate(`/companies/${c.id}`)}>
                <td>
                  <Link to={`/companies/${c.id}`} onClick={(e) => e.stopPropagation()} className="company-link">{c.name}</Link>
                  {c.domain && <div className="muted small">{c.domain}</div>}
                </td>
                <td>{c.industry || '—'}</td>
                <td>{c.employee_count ?? '—'}</td>
                <td>{c.ad_spend_range || '—'}</td>
                <td>{c.contact_count}</td>
                <td>{Number(c.open_deal_value) > 0 ? fmtMoney(c.open_deal_value) : '—'}</td>
                <td><StageChip stage={c.latest_deal_stage} /></td>
                <td>{relTime(c.last_activity_at)}</td>
                <td>{c.open_task_count > 0 ? c.open_task_count : '—'}</td>
              </tr>
            ))}
            {companies.length === 0 && !loadingCompanies && (
              <tr><td colSpan={9} className="muted center">No companies match. Add one or import a prospect list.</td></tr>
            )}
          </tbody>
        </table>
        {companies.length < total && (
          <div className="center pad">
            <button className="btn" onClick={() => fetchCompanies(true)} disabled={loadingCompanies}>
              {loadingCompanies ? 'Loading…' : `Load more (${companies.length} of ${total})`}
            </button>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Add company" onClose={() => setShowAdd(false)}>
          <CompanyForm onSubmit={createCompany} submitLabel="Create company" />
        </Modal>
      )}
    </div>
  );
}
