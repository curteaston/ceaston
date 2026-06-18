import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { fmtMoney, relTime } from '../format.js';
import {
  BUYING_COMMITTEE_LABELS,
  CONTACT_ROLE_LABELS,
  TARGET_TIER_LABELS,
} from '../prospecting.js';

const VIEWS = [
  { key: 'work_now', label: 'Work now' },
  { key: 'ready', label: 'Ready' },
  { key: 'role_gaps', label: 'Role gaps' },
  { key: 'needs_next_step', label: 'No next step' },
  { key: 'replies', label: 'Replies' },
  { key: 'audit_signals', label: 'Audit signals' },
  { key: 'suppressed', label: 'Suppressed' },
];

const WORK_ROLES = ['owner', 'marketing', 'ops'];

const STATUS_LABELS = {
  ready_now: 'Ready',
  find_roles: 'Find roles',
  needs_next_step: 'Needs next step',
  reply_review: 'Reply review',
  blocked_no_contacts: 'No contacts',
  suppressed: 'Suppressed',
};

const STATUS_CLASS = {
  ready_now: 'ok-chip',
  find_roles: 'prio-medium',
  needs_next_step: 'prio-medium',
  reply_review: 'outcome',
  blocked_no_contacts: 'danger-chip',
  suppressed: 'danger-chip',
};

const AUDIT_SEVERITY_CLASS = {
  high: 'danger-chip',
  medium: 'prio-medium',
  low: 'ok-chip',
  watch: 'outcome',
  neutral: '',
};

function roleName(role) {
  return CONTACT_ROLE_LABELS[role] || role || 'Contact';
}

function contactName(contact) {
  if (!contact) return 'Missing';
  return contact.name || contact.email || 'Unnamed contact';
}

function contactTitle(contact) {
  if (!contact) return null;
  return contact.title || roleName(contact.contact_role);
}

function contactLine(contact) {
  if (!contact) return 'None';
  const title = contactTitle(contact);
  return title ? `${contactName(contact)} (${title})` : contactName(contact);
}

function findRoleContact(account, role) {
  return (account.contacts || []).find((contact) => contact.contact_role === role) || null;
}

function roleState(account, role) {
  const contact = findRoleContact(account, role);
  return {
    role,
    contact,
    covered: Boolean(contact) || account.roles?.includes(role),
  };
}

function RoleCoverage({ account, compact = false }) {
  return (
    <div className={compact ? 'role-coverage compact' : 'role-coverage'}>
      {WORK_ROLES.map((role) => {
        const state = roleState(account, role);
        return (
          <div key={role} className={`role-pill ${state.covered ? 'covered' : 'missing'}`}>
            <span>{roleName(role)}</span>
            {!compact && <b>{state.covered ? contactName(state.contact) : 'Needed'}</b>}
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value, active, onClick }) {
  return (
    <button type="button" className={`prospecting-metric${active ? ' active' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <b>{value}</b>
    </button>
  );
}

function AuditSignal({ signal }) {
  if (!signal) return null;
  const className = AUDIT_SEVERITY_CLASS[signal.severity] || '';
  return (
    <div className="audit-signal">
      <span className={`chip ${className}`}>{signal.label}</span>
      <div className="muted small pad-top">{signal.reason}</div>
      {signal.next_action && <div className="muted small pad-top">Audit: {signal.next_action}</div>}
    </div>
  );
}

function EmptyState({ view, hasFilters }) {
  const copy = {
    ready: ['No ready accounts yet.', 'Find missing owner, marketing, and ops coverage, then add a concrete next step.'],
    role_gaps: ['No role gaps in this view.', 'Move to Ready or Work now to decide who deserves outreach today.'],
    needs_next_step: ['Every matching account has a next step.', 'That is good hygiene. Work the queue or import a fresh HVAC list.'],
    replies: ['No replies need review.', 'Work role gaps or ready accounts until a prospect responds.'],
    audit_signals: ['No audit signals match.', 'Submit real audit forms and let responses prove whether there is actual missed-lead pain.'],
    suppressed: ['No suppressed accounts match.', 'Suppressed records will stay out of active outreach.'],
    work_now: ['No active accounts match.', 'Import a focused HVAC list or loosen the filters to rebuild the queue.'],
  }[view] || ['No accounts match.', 'Adjust the filters or import a focused HVAC list.'];

  return (
    <div className="empty-state prospecting-empty">
      <h3>{copy[0]}</h3>
      <p>{hasFilters ? 'Your current search or tier filter is narrowing the queue.' : copy[1]}</p>
      <div className="row gap wrap">
        <Link to="/import" className="btn primary">Import list</Link>
        <Link to="/companies" className="btn">Review companies</Link>
      </div>
    </div>
  );
}

function AccountRow({ account, selected, onSelect }) {
  const statusClass = STATUS_CLASS[account.status] || '';
  const source = [account.source, account.campaign].filter(Boolean).join(' / ') || 'No source';
  const nextStep = account.next_step || account.next_task?.description || account.reason;
  const openValue = account.open_deal_value > 0 ? `${fmtMoney(account.open_deal_value)} open` : null;

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(account.id);
    }
  };

  return (
    <tr
      className={`prospecting-row${selected ? ' selected' : ''}`}
      onClick={() => onSelect(account.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-selected={selected}
    >
      <td className="account-cell">
        <div className="account-name">{account.name}</div>
        <div className="muted small">{account.domain || 'No domain'}</div>
        <div className="account-badges">
          {account.target_tier && <span className="chip tier-chip">{TARGET_TIER_LABELS[account.target_tier] || account.target_tier}</span>}
          <span className={`chip ${statusClass}`}>{STATUS_LABELS[account.status] || account.status}</span>
        </div>
      </td>
      <td className="next-action-cell">
        <div className="next-action-text">{nextStep}</div>
        <div className="muted small">{account.reason}</div>
        <AuditSignal signal={account.audit_signal} />
      </td>
      <td>
        <div>{contactLine(account.primary_contact)}</div>
        <div className="muted small">{account.secondary_contact ? contactLine(account.secondary_contact) : 'No secondary path'}</div>
      </td>
      <td>
        <RoleCoverage account={account} compact />
        <div className="muted small pad-top">{BUYING_COMMITTEE_LABELS[account.buying_committee_status] || account.buying_committee_status || 'Unknown'}</div>
      </td>
      <td>
        <div>{source}</div>
        <div className="muted small">
          {[openValue, `last touch ${relTime(account.last_activity_at)}`].filter(Boolean).join(' - ')}
        </div>
      </td>
    </tr>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <b>{value || 'Not set'}</b>
    </div>
  );
}

function AccountPanel({ account }) {
  if (!account) {
    return (
      <aside className="prospecting-panel">
        <div className="panel-empty">
          <h3>Select an account</h3>
          <p>Choose an account from the queue to see the contact path, role coverage, and next action.</p>
        </div>
      </aside>
    );
  }

  const nextStep = account.next_step || account.next_task?.description || account.reason;
  const source = [account.source, account.campaign].filter(Boolean).join(' / ') || 'No source';

  return (
    <aside className="prospecting-panel">
      <div className="panel-head">
        <div>
          <h2>{account.name}</h2>
          <p>{account.domain || account.website || 'No domain on file'}</p>
        </div>
        {account.target_tier && <span className="chip tier-chip">{TARGET_TIER_LABELS[account.target_tier] || account.target_tier}</span>}
      </div>

      <div className="panel-section primary-action">
        <span>Next action</span>
        <b>{nextStep}</b>
      </div>

      {account.audit_signal && (
        <div className="panel-section">
          <h3>Audit activity</h3>
          <AuditSignal signal={account.audit_signal} />
        </div>
      )}

      <div className="panel-section">
        <h3>Buying committee</h3>
        <RoleCoverage account={account} />
      </div>

      <div className="panel-section">
        <h3>Contact path</h3>
        <DetailLine label="Primary" value={contactLine(account.primary_contact)} />
        <DetailLine label="Secondary" value={account.secondary_contact ? contactLine(account.secondary_contact) : 'Not set'} />
      </div>

      <div className="panel-section">
        <h3>Account context</h3>
        <DetailLine label="Status" value={STATUS_LABELS[account.status] || account.status} />
        <DetailLine label="Source" value={source} />
        <DetailLine label="Ad spend" value={account.ad_spend_range} />
        <DetailLine label="Owner" value={account.owner} />
      </div>

      <Link to={`/companies/${account.id}`} className="btn primary panel-link">Open full company record</Link>
    </aside>
  );
}

export default function Prospecting() {
  const [view, setView] = useState('work_now');
  const [targetTier, setTargetTier] = useState('');
  const [q, setQ] = useState('');
  const [hideTestData, setHideTestData] = useState(() => localStorage.getItem('prospecting_hide_test_data') !== '0');
  const [selectedId, setSelectedId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    localStorage.setItem('prospecting_hide_test_data', hideTestData ? '1' : '0');
    setError(null);
    api.get(`/prospecting/workbench${qs({
      view,
      q,
      target_tier: targetTier,
      hide_test_data: hideTestData,
      limit: 100,
    })}`)
      .then(setData)
      .catch((err) => {
        setError(err.message);
        setData(null);
      });
  }, [view, q, targetTier, hideTestData]);

  useEffect(() => {
    if (!data) return;
    if (data.accounts.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!data.accounts.some((account) => account.id === selectedId)) {
      setSelectedId(data.accounts[0].id);
    }
  }, [data, selectedId]);

  const activeView = useMemo(() => VIEWS.find((item) => item.key === view) || VIEWS[0], [view]);
  const selectedAccount = useMemo(
    () => data?.accounts.find((account) => account.id === selectedId) || null,
    [data, selectedId],
  );
  const hasFilters = Boolean(q || targetTier);

  return (
    <div className="prospecting-page">
      <div className="page-head prospecting-head">
        <div>
          <p className="eyebrow">RunWise Prospecting</p>
          <h1>Work the right HVAC accounts next</h1>
          <div className="company-meta">
            <span>{activeView.label}</span>
            <span>{data?.summary?.work_now ?? '-'} active accounts</span>
          </div>
        </div>
        <div className="row gap wrap">
          <Link to="/import" className="btn primary">Import list</Link>
          <Link to="/companies" className="btn">Companies</Link>
        </div>
      </div>

      <div className="prospecting-metrics">
        <SummaryCard label="Work now" value={data?.summary?.work_now ?? '-'} active={view === 'work_now'} onClick={() => setView('work_now')} />
        <SummaryCard label="Ready" value={data?.summary?.ready ?? '-'} active={view === 'ready'} onClick={() => setView('ready')} />
        <SummaryCard label="Role gaps" value={data?.summary?.role_gaps ?? '-'} active={view === 'role_gaps'} onClick={() => setView('role_gaps')} />
        <SummaryCard label="No next step" value={data?.summary?.needs_next_step ?? '-'} active={view === 'needs_next_step'} onClick={() => setView('needs_next_step')} />
        <SummaryCard label="Replies" value={data?.summary?.replies ?? '-'} active={view === 'replies'} onClick={() => setView('replies')} />
        <SummaryCard label="Audit signals" value={data?.summary?.audit_signals ?? '-'} active={view === 'audit_signals'} onClick={() => setView('audit_signals')} />
        <SummaryCard label="Suppressed" value={data?.summary?.suppressed ?? '-'} active={view === 'suppressed'} onClick={() => setView('suppressed')} />
      </div>

      <div className="card prospecting-controls">
        <div className="segmented">
          {VIEWS.map((item) => (
            <button key={item.key} className={view === item.key ? 'on' : ''} onClick={() => setView(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <input className="filter-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account, contact, campaign..." />
          <select value={targetTier} onChange={(e) => setTargetTier(e.target.value)}>
            <option value="">Any tier</option>
            {Object.entries(TARGET_TIER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label className="checkbox-inline">
            <input type="checkbox" checked={hideTestData} onChange={(e) => setHideTestData(e.target.checked)} />
            Hide test records
          </label>
          {data?.hidden_test_records > 0 && <span className="quiet-note">{data.hidden_test_records} hidden</span>}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!data && !error && <p className="muted">Loading...</p>}
      {data && (
        <div className="prospecting-workbench">
          <div className="card table-card prospecting-table-card">
            <table className="prospecting-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Next action</th>
                  <th>Contact path</th>
                  <th>Coverage</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    selected={account.id === selectedId}
                    onSelect={setSelectedId}
                  />
                ))}
                {data.accounts.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      <EmptyState view={view} hasFilters={hasFilters} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <AccountPanel account={selectedAccount} />
        </div>
      )}
    </div>
  );
}
