import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useStore } from './store.js';
import { api } from './api.js';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Companies from './pages/Companies.jsx';
import CallLogModal from './components/CallLogModal.jsx';
import Contacts from './pages/Contacts.jsx';
import CompanyDetail from './pages/CompanyDetail.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Sequences from './pages/Sequences.jsx';
import Tasks from './pages/Tasks.jsx';
import Import from './pages/Import.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';

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

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/companies', label: 'Companies', icon: '🏢' },
  { to: '/contacts', label: 'Contacts', icon: '👤' },
  { to: '/pipeline', label: 'Pipeline', icon: '🧭' },
  { to: '/sequences', label: 'Sequences', icon: '🔁' },
  { to: '/tasks', label: 'Tasks', icon: '✅' },
  { to: '/import', label: 'Import', icon: '📥' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const { toast, fetchMeta } = useStore();
  const [auth, setAuth] = useState(null); // null = checking, true = ok, false = need login
  const [authRequired, setAuthRequired] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem('nav_collapsed') === '1');

  const toggleNav = () => setNavCollapsed((v) => {
    const next = !v;
    localStorage.setItem('nav_collapsed', next ? '1' : '0');
    return next;
  });

  const checkAuth = () =>
    api.get('/auth/status')
      .then((s) => { setAuthRequired(s.auth_required); setAuth(!s.auth_required || s.authenticated); })
      .catch(() => setAuth(true)); // if status can't be read, don't hard-block

  useEffect(() => {
    checkAuth();
    const onUnauth = () => setAuth(false);
    window.addEventListener('crm-unauthorized', onUnauth);
    return () => window.removeEventListener('crm-unauthorized', onUnauth);
  }, []);

  useEffect(() => { if (auth) fetchMeta(); }, [auth]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setAuth(false);
  };

  if (auth === null) return <div className="login-screen"><div className="muted">Loading…</div></div>;
  if (auth === false) return <Login onSuccess={() => { setAuth(true); fetchMeta(); }} />;

  return (
    <div className={`app${navCollapsed ? ' nav-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">❄️🔥</span>
          {!navCollapsed && <span className="logo-text">HVAC CRM</span>}
        </div>
        <button className="nav-toggle" onClick={toggleNav} title={navCollapsed ? 'Expand menu' : 'Collapse menu'}>
          {navCollapsed ? '›' : '‹'}
        </button>
        <nav>
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-item" data-label={label} title={label}>
              <span className="nav-icon">{icon}</span>
              {!navCollapsed && <span className="nav-label">{label}</span>}
            </NavLink>
          ))}
        </nav>
        {authRequired && (
          <button className="sidebar-logout nav-item" data-label="Sign out" title="Sign out" onClick={logout}>
            <span className="nav-icon">↩</span>
            {!navCollapsed && <span className="nav-label">Sign out</span>}
          </button>
        )}
      </aside>
      <div className="main">
        <header className="topbar">
          <GlobalSearch />
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyDetail />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/sequences" element={<Sequences />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/import" element={<Import />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      {toast && <div className={`toast ${toast.isError ? 'error' : ''}`}>{toast.message}</div>}
      <CallLogModal />
    </div>
  );
}
