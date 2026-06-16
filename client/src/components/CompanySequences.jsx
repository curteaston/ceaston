import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import EnrollModal from './EnrollModal.jsx';
import { fmtDate } from '../format.js';
import { isSuppressed, suppressionText } from '../prospecting.js';

const RUN_ICON = { task: '☑️', auto_email: '✉️' };
const STATUS_LABEL = {
  pending: 'pending', done: 'done', sent: 'sent', skipped: 'skipped', failed: 'failed',
};

export default function CompanySequences({ company }) {
  const { run } = useStore();
  const [enrollments, setEnrollments] = useState([]);
  const [enrolling, setEnrolling] = useState(false);

  const load = () =>
    api.get(`/sequences/enrollments/list?company_id=${company.id}`).then(setEnrollments).catch(() => {});
  useEffect(() => { load(); }, [company.id]);

  const unenroll = (e) => {
    if (!confirm(`Unenroll from "${e.sequence_name}"? Remaining open tasks will be removed.`)) return;
    run(async () => { await api.post(`/sequences/enrollments/${e.id}/unenroll`); load(); }, 'Unenrolled');
  };
  const markReplied = (e) =>
    run(async () => { await api.post(`/sequences/enrollments/${e.id}/replied`); load(); }, 'Marked replied — sequence stopped');
  const retry = (e) =>
    run(async () => { await api.post(`/sequences/enrollments/${e.id}/retry`); load(); }, 'Retried failed steps');

  const active = enrollments.filter((e) => e.status === 'active');
  const past = enrollments.filter((e) => e.status !== 'active');
  const suppressed = isSuppressed(company);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Sequences</h3>
        <button className="btn small" disabled={suppressed} onClick={() => setEnrolling(true)}>+ Enroll</button>
      </div>

      {suppressed && <p className="error-text small">Enrollment blocked: {suppressionText(company)}</p>}
      {enrollments.length === 0 && <p className="muted small">Not in any sequence. Enroll to start an outbound cadence.</p>}

      {[...active, ...past].map((e) => {
        const hasFailed = e.runs.some((r) => r.status === 'failed');
        return (
          <div key={e.id} className={`enroll-card ${e.status !== 'active' ? 'muted-card' : ''}`}>
            <div className="row between">
              <b>{e.sequence_name}</b>
              <span className={`chip ${e.status === 'active' ? 'outcome' : e.status === 'replied' ? 'stage stage-won' : ''}`}>{e.status}</span>
            </div>
            <div className="muted small">
              {e.contact_name ? `${e.contact_name} · ` : ''}{e.completed}/{e.total} steps
              {e.status === 'active' && e.next_due && ` · next ${RUN_ICON[e.next_kind] || ''} ${fmtDate(e.next_due)}`}
            </div>
            <div className="enroll-steps">
              {e.runs.map((r) => (
                <span
                  key={r.id}
                  className={`enroll-pip pip-${r.status}`}
                  title={`${r.step_kind === 'auto_email' ? 'Email' : 'Task'}: ${r.description || r.subject || ''} — ${STATUS_LABEL[r.status]}${r.error ? ` (${r.error})` : ''}`}
                >
                  {RUN_ICON[r.step_kind] || '•'}
                </span>
              ))}
            </div>
            {hasFailed && (
              <div className="small error-text">
                Some emails failed to send.{' '}
                <button className="link-btn" onClick={() => retry(e)}>Retry</button>
              </div>
            )}
            {e.status === 'active' && (
              <div className="row gap">
                <button className="link-btn" onClick={() => markReplied(e)}>Mark replied</button>
                <button className="link-btn danger" onClick={() => unenroll(e)}>Unenroll</button>
              </div>
            )}
          </div>
        );
      })}

      {enrolling && (
        <EnrollModal company={company} onClose={() => setEnrolling(false)} onEnrolled={load} />
      )}
    </div>
  );
}
