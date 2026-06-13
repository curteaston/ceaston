import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';

// Named, persisted filter/sort presets shown as extra tabs. `captureState` returns the
// page's current filter object; `applyState` restores one.
export default function SavedViews({ entity, captureState, applyState }) {
  const { run, notify } = useStore();
  const [views, setViews] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const load = () => api.get(`/views?entity=${entity}`).then(setViews).catch(() => {});
  useEffect(() => { load(); }, [entity]);

  const save = () => {
    const name = prompt('Name this view (e.g. "Cold 14d+, 50+ employees"):');
    if (!name?.trim()) return;
    run(async () => {
      const v = await api.post('/views', { entity, name: name.trim(), state: captureState() });
      await load();
      setActiveId(v.id);
    }, 'View saved');
  };

  const apply = (v) => {
    applyState(v.state);
    setActiveId(v.id);
  };

  const del = (v, e) => {
    e.stopPropagation();
    if (!confirm(`Delete saved view "${v.name}"?`)) return;
    run(async () => {
      await api.del(`/views/${v.id}`);
      if (activeId === v.id) setActiveId(null);
      await load();
    }, 'View deleted');
  };

  return (
    <>
      {views.map((v) => (
        <button key={v.id} className={`tab ${activeId === v.id ? 'on' : ''}`} onClick={() => apply(v)}>
          ★ {v.name}
          <span className="view-del" title="Delete view" onClick={(e) => del(v, e)}>✕</span>
        </button>
      ))}
      <button className="tab tab-add" onClick={save} title="Save current filters as a view">+ Save view</button>
    </>
  );
}
