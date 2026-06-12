import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, LIFECYCLE_LABELS } from '../store.js';
import { relTime } from '../format.js';

function BoardCard({ company, onAction, onDragStart }) {
  return (
    <div
      className="board-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(company.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(company);
      }}
    >
      <Link to={`/companies/${company.id}`} className="company-link">{company.name}</Link>
      {company.domain && <div className="muted small">{company.domain}</div>}
      <div className="board-card-meta small muted">
        {company.contact_count > 0 && <span>👥 {company.contact_count}</span>}
        {Number(company.open_deal_value) > 0 && (
          <span>💰 ${Math.round(company.open_deal_value).toLocaleString()}</span>
        )}
      </div>
      <div className="board-card-activity small">
        {company.latest_activity_type
          ? <><span className="muted">Last:</span> {company.latest_activity_type} {relTime(company.last_activity_at)}</>
          : <span className="muted">No activity {company.last_activity_at ? relTime(company.last_activity_at) : ''}</span>}
      </div>
      <div className="board-card-actions">
        <button title="Preview" onClick={() => onAction('preview', company)}>👁</button>
        <button title="AI summary" onClick={() => onAction('summary', company)}>✨</button>
        <button title="Send email" onClick={() => onAction('email', company)}>✉️</button>
        <button title="Create note" onClick={() => onAction('note', company)}>📝</button>
      </div>
    </div>
  );
}

export default function CompanyBoard({ companies, onMove, onAction }) {
  const { meta } = useStore();
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  const drop = (stage) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    const company = companies.find((c) => c.id === id);
    if (company && company.lifecycle_stage !== stage) onMove(company, stage);
    setDragging(null);
  };

  return (
    <div className="pipeline-board lifecycle-board">
      {meta.lifecycle_stages.map((stage) => {
        const cards = companies.filter((c) => (c.lifecycle_stage || 'lead') === stage);
        return (
          <div
            key={stage}
            className={`pipeline-col ${dragOver === stage && dragging ? 'drop-target' : ''}`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(stage); }}
            onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
            onDrop={drop(stage)}
          >
            <div className="pipeline-col-head">
              <b>{LIFECYCLE_LABELS[stage]}</b>
              <span className="col-count">{cards.length}</span>
            </div>
            {cards.map((c) => (
              <BoardCard key={c.id} company={c} onAction={onAction} onDragStart={setDragging} />
            ))}
            {cards.length === 0 && <div className="board-empty muted small">Drop companies here</div>}
          </div>
        );
      })}
    </div>
  );
}
