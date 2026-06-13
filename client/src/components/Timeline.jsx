import { useState } from 'react';
import { fmtDateTime } from '../format.js';

const ICONS = {
  call: '📞', email: '✉️', sms: '💬', meeting: '📅',
  linkedin: '💼', stage_change: '🔀', other: '📌', note: '📝',
};

function TimelineItem({ item, onEditNote, onDeleteNote, onPinNote }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isNote = item.kind === 'note';
  const icon = isNote ? ICONS.note : ICONS[item.type] || ICONS.other;

  const startEdit = () => { setDraft(item.body); setEditing(true); };
  const submit = async () => {
    if (draft.trim()) await onEditNote(item.id, draft.trim());
    setEditing(false);
  };

  return (
    <div className={`tl-item${isNote && item.pinned ? ' tl-pinned' : ''}`}>
      <div className="tl-icon">{icon}</div>
      <div className="tl-body">
        <div className="tl-head">
          <span className="tl-type">
            {isNote ? 'Note' : (item.type || 'activity').replace('_', ' ')}
            {isNote && item.pinned && <span className="chip tl-pin-chip">📌 pinned</span>}
            {isNote && item.source === 'voice' && <span className="chip voice">🎙 voice</span>}
            {item.outcome && <span className="chip outcome">{item.outcome}</span>}
          </span>
          {item.contact_name && <span className="chip contact-chip">{item.contact_name}</span>}
          <span className="tl-time" title={fmtDateTime(item.occurred_at)}>
            {fmtDateTime(item.occurred_at)}
            {isNote && item.updated_at !== item.occurred_at && ' · edited'}
          </span>
        </div>
        {editing ? (
          <div className="tl-edit">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
            <div className="row gap">
              <button className="btn primary small" onClick={submit}>Save</button>
              <button className="btn small" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          item.body && <p className="tl-text">{item.body}</p>
        )}
        {isNote && !editing && (
          <div className="tl-actions">
            <button className="link-btn" onClick={() => onPinNote(item.id, !item.pinned)}>
              {item.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button className="link-btn" onClick={startEdit}>Edit</button>
            <button className="link-btn danger" onClick={() => onDeleteNote(item.id)}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Timeline({ items, onEditNote, onDeleteNote, onPinNote, emptyText = 'No activity yet.' }) {
  if (!items?.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="timeline">
      {items.map((item) => (
        <TimelineItem
          key={`${item.kind}-${item.id}`}
          item={item}
          onEditNote={onEditNote}
          onDeleteNote={onDeleteNote}
          onPinNote={onPinNote}
        />
      ))}
    </div>
  );
}
