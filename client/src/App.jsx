import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useStore } from './store.js';
import { api } from './api.js';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Companies from './pages/Companies.jsx';
import Contacts from './pages/Contacts.jsx';
import CompanyDetail from './pages/CompanyDetail.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Tasks from './pages/Tasks.jsx';
import Import from './pages/Import.jsx';
import Settings from './pages/Settings.jsx';

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const navigate = useNavigate();
  const timer = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setResults(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const onChange = (value) => {
    setQ(value);
    clearTimeout(timer.current);
    if (!value.trim()) return setResults(null);
    timer.current = setTimeout(async () => {
      try {
        setResults(await api.get(`/search?q=${encodeURIComponent(value.trim())}`));
      } catch { /* ignore transient search errors */ }
    }, 250);
  };

  const go = (companyId) => {
    setQ('');
    setResults(null);
    navigate(`/companies/${companyId}`);
  };

  return (
    <div className="global-search" ref={boxRef}>
      <input
        placeholder="Search companies, domains, contacts…"
        value={q}
        onChange={(e) => onChange(e.target.value)}
      />
      {results && (results.companies.length || results.contacts.length) > 0 && (
        <div className="search-results">
          {results.companies.map((c) => (
            <button key={`co${c.id}`} onClick={() => go(c.id)}>
              🏢 {c.name} {c.domain && <span className="muted">{c.domain}</span>}
            </button>
          ))}
          {results.contacts.map((c) => (
            <button key={`ct${c.id}`} onClick={() => go(c.company_id)}>
              👤 {c.name} <span className="muted">{c.title || c.email} · {c.company_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { toast, fetchMeta } = useStore();
  useEffect(() => { fetchMeta(); }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">❄️🔥 <span>HVAC CRM</span></div>
        <nav>
          <NavLink to="/" end>🏠 Home</NavLink>
          <NavLink to="/dashboard">📊 Dashboard</NavLink>
          <NavLink to="/companies">🏢 Companies</NavLink>
          <NavLink to="/contacts">👤 Contacts</NavLink>
          <NavLink to="/pipeline">🧭 Pipeline</NavLink>
          <NavLink to="/tasks">✅ Tasks</NavLink>
          <NavLink to="/import">📥 Import</NavLink>
          <NavLink to="/settings">⚙️ Settings</NavLink>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <GlobalSearch />
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyDetail />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/import" element={<Import />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      {toast && <div className={`toast ${toast.isError ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  );
}
