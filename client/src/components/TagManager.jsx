import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Lighten a hex color for background use
function lightenColor(hex, amount = 0.85) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr},${lg},${lb})`;
}

// Props: entityType ('company'|'contact'), entityId, tags (current tags array of objects), onChanged
export default function TagManager({ entityType, entityId, tags = [], onChanged }) {
  const [allTags, setAllTags] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const wrapRef = useRef(null);

  const loadAllTags = () => {
    api.get('/tags').then(setAllTags).catch(() => {});
  };

  useEffect(() => {
    loadAllTags();
  }, []);

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const currentTagIds = new Set((tags || []).map((t) => (typeof t === 'object' ? t.id : null)).filter(Boolean));
  const currentTagNames = new Set((tags || []).map((t) => (typeof t === 'object' ? t.name : t)));

  const filtered = allTags.filter((t) => {
    if (currentTagIds.has(t.id)) return false;
    if (!inputValue.trim()) return true;
    return t.name.toLowerCase().includes(inputValue.toLowerCase());
  });

  const deleteTagGlobally = async (tag, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete tag "${tag.name}" everywhere?`)) return;
    try {
      await api.del(`/tags/${tag.id}`);
      loadAllTags();
      onChanged();
    } catch (err) {
      console.error('Failed to delete tag', err);
    }
  };

  const removeTag = async (tag) => {
    const tagId = typeof tag === 'object' ? tag.id : null;
    if (!tagId) return;
    try {
      await api.del(`/tags/${entityType}/${entityId}/${tagId}`);
      onChanged();
    } catch (e) {
      console.error('Failed to remove tag', e);
    }
  };

  const addTag = async (tag) => {
    try {
      await api.post(`/tags/${entityType}/${entityId}`, { tag_id: tag.id });
      setInputValue('');
      setShowDrop(false);
      onChanged();
    } catch (e) {
      console.error('Failed to add tag', e);
    }
  };

  const createAndAdd = async () => {
    const name = inputValue.trim();
    if (!name) return;
    try {
      const tag = await api.post('/tags', { name });
      await api.post(`/tags/${entityType}/${entityId}`, { tag_id: tag.id });
      setInputValue('');
      setShowDrop(false);
      loadAllTags();
      onChanged();
    } catch (e) {
      console.error('Failed to create tag', e);
    }
  };

  const showCreateOption = inputValue.trim() && !allTags.some((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase()) && !currentTagNames.has(inputValue.trim());

  return (
    <div className="tag-manager" ref={wrapRef}>
      {(tags || []).map((tag) => {
        const color = typeof tag === 'object' ? (tag.color || '#6366f1') : '#6366f1';
        const name = typeof tag === 'object' ? tag.name : tag;
        return (
          <span
            key={typeof tag === 'object' ? tag.id : name}
            className="tag-chip"
            style={{ backgroundColor: lightenColor(color), color }}
          >
            {name}
            <span
              className="tag-chip-remove"
              onClick={() => removeTag(tag)}
              title="Remove tag"
            >×</span>
          </span>
        );
      })}
      <div className="tag-input-wrap">
        <input
          style={{ width: 120, fontSize: 12, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 6 }}
          placeholder="Add tag…"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setShowDrop(true); }}
          onFocus={() => setShowDrop(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (showCreateOption) createAndAdd(); else if (filtered.length === 1) addTag(filtered[0]); } }}
        />
        {showDrop && (filtered.length > 0 || showCreateOption) && (
          <div className="tag-dropdown">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="tag-dropdown-item"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                onMouseDown={(e) => { e.preventDefault(); addTag(t); }}
              >
                <span className="tag-chip" style={{ backgroundColor: lightenColor(t.color || '#6366f1'), color: t.color || '#6366f1' }}>
                  {t.name}
                </span>
                <span
                  title="Delete tag everywhere"
                  style={{ marginLeft: 8, color: '#ef4444', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}
                  onMouseDown={(e) => { e.preventDefault(); deleteTagGlobally(t, e); }}
                >🗑</span>
              </div>
            ))}
            {showCreateOption && (
              <div
                className="tag-dropdown-item"
                style={{ color: 'var(--primary)', fontWeight: 600 }}
                onMouseDown={(e) => { e.preventDefault(); createAndAdd(); }}
              >
                ＋ Create &ldquo;{inputValue.trim()}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
