import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useStore } from '../store.js';
import { StageChip } from '../components/widgets.jsx';
import { fmtMoney } from '../format.js';

const PRESETS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom']];
const iso = (d) => d.toISOString().slice(0, 10);

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

// Lightweight inline bar chart (no chart library).
function BarChart({ data, xKey, yKey, height = 120 }) {
  const max = Math.max(1, ...data.map((d) => d[yKey]));
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={`${d[xKey]}: ${d[yKey]}`}>
          <div className="bar-fill" style={{ height: `${(d[yKey] / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { notify } = useStore();
  const [preset, setPreset] = useState('30');
  const [custom, setCustom] = useState({ from: iso(new Date(Date.now() - 29 * 86400000)), to: iso(new Date()) });
  const [data, setData] = useState(null);

  const range = useMemo(() => {
    if (preset === 'custom') return custom;
    const days = Number(preset);
    return { from: iso(new Date(Date.now() - (days - 1) * 86400000)), to: iso(new Date()) };
  }, [preset, custom]);

  useEffect(() => {
    api.get(`/reports${qs(range)}`).then(setData).catch((e) => notify(e.message, true));
  }, [range]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['Metric', 'Value'],
      ['Range', `${data.range.from} to ${data.range.to}`],
      ['New companies', data.new.companies],
      ['New contacts', data.new.contacts],
      ['Activities', data.activity_total],
      ['Deals created', data.deals.created],
      ['Deals won', data.deals.won],
      ['Deals lost', data.deals.lost],
      ['Won value', data.deals.won_value],
      ['Win rate %', data.deals.win_rate ?? ''],
      ['Tasks created', data.tasks.created],
      ['Tasks completed', data.tasks.completed],
      ['Task completion %', data.tasks.completion_rate ?? ''],
      ['Sequence enrollments', data.sequences.enrolled],
      ['Sequence emails sent', data.sequences.emails_sent],
      ['Sequence replies', data.sequences.replies],
    ];
    const blob = new Blob([rows.map((r) => r.map((v) => `"${v ?? ''}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-${data.range.from}_${data.range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <p className="muted">Loading reports…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <div className="muted small">{data.range.from} → {data.range.to}</div>
        </div>
        <div className="row gap">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {preset === 'custom' && (
            <>
              <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </>
          )}
          <button className="btn" onClick={exportCsv}>Export</button>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Activities" value={data.activity_total} sub="calls, emails, meetings logged" />
        <Stat label="New companies" value={data.new.companies} />
        <Stat label="New contacts" value={data.new.contacts} />
        <Stat label="Deals won" value={data.deals.won} sub={`${fmtMoney(data.deals.won_value)} · ${data.deals.win_rate != null ? data.deals.win_rate + '% win rate' : 'no closed deals'}`} />
        <Stat label="Tasks completed" value={data.tasks.completed} sub={`${data.tasks.completion_rate != null ? data.tasks.completion_rate + '% of created' : ''}`} />
        <Stat label="Sequence emails" value={data.sequences.emails_sent} sub={`${data.sequences.enrolled} enrolled · ${data.sequences.replies} replied`} />
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3>Activity over time</h3>
          {data.activity_total === 0
            ? <p className="muted">No activity logged in this range.</p>
            : <BarChart data={data.activity_by_day} xKey="day" yKey="activities" />}
          <div className="row between muted small pad-top">
            <span>{data.range.from}</span><span>{data.range.to}</span>
          </div>
        </div>

        <div className="card">
          <h3>Activity by type</h3>
          {data.activity_by_type.length === 0 && <p className="muted">No activity yet.</p>}
          <table className="mini-table">
            <tbody>
              {data.activity_by_type.map((r) => (
                <tr key={r.type}><td style={{ textTransform: 'capitalize' }}>{r.type}</td><td className="right"><b>{r.n}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Pipeline snapshot</h3>
          {data.funnel.map((f) => {
            const max = Math.max(1, ...data.funnel.map((x) => x.count));
            return (
              <div key={f.stage} className="funnel-row">
                <span className="funnel-label"><StageChip stage={f.stage} /></span>
                <div className="funnel-bar-track">
                  <div className={`funnel-bar stage-bar-${f.stage}`} style={{ width: `${(f.count / max) * 100}%` }} />
                </div>
                <span className="funnel-count">{f.count}</span>
              </div>
            );
          })}
        </div>

        <div className="card">
          <h3>Sequence performance</h3>
          {data.sequences.per_sequence.length === 0 && <p className="muted">No sequences yet.</p>}
          <table className="mini-table">
            <thead><tr><th>Sequence</th><th className="right">Enrolled</th><th className="right">Sent</th><th className="right">Replies</th></tr></thead>
            <tbody>
              {data.sequences.per_sequence.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="right">{s.enrollments}</td>
                  <td className="right">{s.emails_sent}</td>
                  <td className="right">{s.replies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Most active companies</h3>
          {data.top_active_companies.length === 0 && <p className="muted">No activity yet.</p>}
          {data.top_active_companies.map((c) => (
            <div key={c.id} className="row between recent-row">
              <Link to={`/companies/${c.id}`} className="company-link">{c.name}</Link>
              <b>{c.activities}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
