import { useEffect, useState } from 'react';

// Right-hand drawer used for record previews and AI summaries. Expandable to near full width.
export default function SidePanel({ title, onClose, children, headerExtra }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`side-panel ${expanded ? 'expanded' : ''}`}>
      <div className="side-panel-head">
        <h3>{title}</h3>
        <div className="row gap">
          {headerExtra}
          <button
            className="icon-btn"
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '⤡' : '⤢'}
          </button>
          <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="side-panel-body">{children}</div>
    </div>
  );
}
