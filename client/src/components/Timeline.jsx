import { useState } from 'react';
import { fmtDateTime } from '../format.js';

function EmailBody({ body, outcome, contactName }) {
  const [subject, ...rest] = (body || '').split('\n\n');
  const preview = rest.join('\n\n').trim();
  const direction = outcome?.toLowerCase();
  return (
    <div className="tl-email-body">
      <div><strong>{subject}</strong></div>
      {direction && contactName && (
        <div className="muted small">
          {direction === 'sent' ? `From you to ${contactName}` : `From ${contactName} to you`}
        </div>
      )}
      {preview && <p className="tl-text" style={{ marginTop: 4 }}>{preview}</p>}
    </div>
  );
}

const ICONS = {
  task: '☑️',
  call: '📞', email: '✉️', sms: '💬', meeting: '📅',
  linkedin: '💼', stage_change: '🔀', other: '📌', note: '📝',
};

function TimelineItem({ item, onEditNote, onDeleteNote, onPinNote, onCompleteTask, onDeleteTask }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isNote = item.kind === 'note';
  const isTask = item.kind === 'task' || item.type === 'task';
  const taskCompleted = item.completed || item.outcome === 'completed';
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
        ) : item.type === 'email' && item.body ? (
          <EmailBody body={item.body} outcome={item.outcome} contactName={item.contact_name} />
        ) : (
          item.body && <p className="tl-text">{item.body}</p>
        )}
        {isNote && !editing && (
          <div className="tl-actions">
            {onPinNote && (
              <button className="link-btn" onClick={() => onPinNote(item.id, !item.pinned)}>
                {item.pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {onEditNote && <button className="link-btn" onClick={startEdit}>Edit</button>}
            {onDeleteNote && <button className="link-btn danger" onClick={() => onDeleteNote(item.id)}>Delete</button>}
          </div>
        )}
        {isTask && !editing && (onCompleteTask || onDeleteTask) && (
          <div className="tl-actions">
            {!taskCompleted && onCompleteTask && (
              <button className="link-btn" onClick={() => onCompleteTask(item.id)}>Complete</button>
            )}
            {onDeleteTask && (
              <button className="link-btn danger" onClick={() => onDeleteTask(item.id)}>Delete</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Timeline({
  items,
  onEditNote,
  onDeleteNote,
  onPinNote,
  onCompleteTask,
  onDeleteTask,
  emptyText = 'No activity yet.',
}) {
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
          onCompleteTask={onCompleteTask}
          onDeleteTask={onDeleteTask}
        />
      ))}
    </div>
  );
}
