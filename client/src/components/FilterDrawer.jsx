import { useState } from 'react';

export function FilterSection({ title, activeCount = 0, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen || activeCount > 0);
  return (
    <div className="fd-section">
      <button className="fd-section-head" onClick={() => setOpen((v) => !v)}>
        <span className="fd-chevron">{open ? '▾' : '›'}</span>
        {title}
        {activeCount > 0 && <span className="fd-badge">{activeCount}</span>}
      </button>
      {open && <div className="fd-section-body">{children}</div>}
    </div>
  );
}

export default function FilterDrawer({ title = 'Filters', onClose, onClear, activeCount = 0, children }) {
  return (
    <>
      <div className="fd-overlay" onClick={onClose} />
      <div className="fd-drawer">
        <div className="fd-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="fd-body">{children}</div>
        <div className="fd-foot">
          <button className="link-btn" onClick={onClear}>Clear all filters</button>
          {activeCount > 0 && (
            <span className="fd-badge">{activeCount} active</span>
          )}
        </div>
      </div>
    </>
  );
}
