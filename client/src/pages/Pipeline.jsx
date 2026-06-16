import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { fmtDate, fmtMoney } from '../format.js';

export default function Pipeline() {
  const { meta, run } = useStore();
  const [deals, setDeals] = useState([]);

  const load = async () => setDeals(await api.get('/deals'));
  useEffect(() => { load().catch(() => {}); }, []);

  const moveDeal = (deal, stage) =>
    run(async () => {
      await api.patch(`/deals/${deal.id}`, { stage });
      await load();
    }, `Moved to ${stage}`);

  const stages = meta.stages;

  return (
    <div>
      <div className="page-head"><h1>Pipeline</h1></div>
      <div className="pipeline-board">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          const total = stageDeals.reduce((s, d) => s + Number(d.value), 0);
          const idx = stages.indexOf(stage);
          return (
            <div key={stage} className={`pipeline-col stage-bg-${stage}`}>
              <div className="pipeline-col-head">
                <b>{stage}</b>
                <span className="muted small">{stageDeals.length} · {fmtMoney(total)}</span>
              </div>
              {stageDeals.map((d) => (
                <div key={d.id} className="pipeline-card">
                  <div className="small"><b>{d.name}</b></div>
                  <Link to={`/companies/${d.company_id}`} className="small company-link">{d.company_name}</Link>
                  <div className="row between small muted">
                    <span>{fmtMoney(d.value)} · {d.probability}%</span>
                    <span>{d.expected_close_date ? fmtDate(d.expected_close_date) : ''}</span>
                  </div>
                  <div className="row between move-row">
                    <button
                      className="icon-btn" disabled={idx === 0}
                      title="Move back"
                      onClick={() => moveDeal(d, stages[idx - 1])}
                    >←</button>
                    <button
                      className="icon-btn" disabled={idx === stages.length - 1}
                      title="Move forward"
                      onClick={() => moveDeal(d, stages[idx + 1])}
                    >→</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
