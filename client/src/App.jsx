import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useStore } from './store.js';
import { api } from './api.js';
import runwiseLogo from './assets/runwise-logo-white.png';
import CallLogModal from './components/CallLogModal.jsx';
import Login from './pages/Login.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Companies = lazy(() => import('./pages/Companies.jsx'));
const Prospecting = lazy(() => import('./pages/Prospecting.jsx'));
const Contacts = lazy(() => import('./pages/Contacts.jsx'));
const ContactDetail = lazy(() => import('./pages/ContactDetail.jsx'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail.jsx'));
const Pipeline = lazy(() => import('./pages/Pipeline.jsx'));
const Sequences = lazy(() => import('./pages/Sequences.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const Import = lazy(() => import('./pages/Import.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

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
        placeholder="Search companies, domains, contacts..."
        value={q}
        onChange={(e) => onChange(e.target.value)}
      />
      {results && (results.companies.length || results.contacts.length) > 0 && (
        <div className="search-results">
          {results.companies.map((c) => (
            <button key={`co${c.id}`} onClick={() => go(c.id)}>
              {c.name} {c.domain && <span className="muted">{c.domain}</span>}
            </button>
          ))}
          {results.contacts.map((c) => (
            <button key={`ct${c.id}`} onClick={() => go(c.company_id)}>
              {c.name} <span className="muted">{c.title || c.email} - {c.company_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavIcon({ name }) {
  const paths = {
    target: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    home: <path d="M3 11.5 12 4l9 7.5M5 10.5V20h5v-5h4v5h5v-9.5" />,
    dashboard: <path d="M4 13h6v7H4zM14 4h6v16h-6zM4 4h6v5H4z" />,
    reports: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-7" />,
    companies: <path d="M4 20V6h7v14M11 9h8v11M7 10h1M7 14h1M15 12h1M15 16h1" />,
    contacts: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20c.8-4 3-6 5.5-6s4.7 2 5.5 6" />
        <path d="M15 7.5a2.5 2.5 0 1 1 2.5 2.5M15.5 14c2.5.2 4.4 2.2 5 6" />
      </>
    ),
    pipeline: <path d="M4 5h6v5H4zM14 5h6v5h-6zM4 14h6v5H4zM10 7.5h4M7 10v4M17 10v2c0 1.3-.7 2-2 2h-5" />,
    sequences: <path d="M4 7h12l-3-3M16 7l-3 3M20 17H8l3 3M8 17l3-3" />,
    tasks: <path d="m5 12 4 4L19 6M4 5h8M4 19h16" />,
    import: <path d="M12 3v11M8 10l4 4 4-4M5 21h14M5 17v4M19 17v4" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7.8 7.8 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.1 7.1 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7.1 7.1 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.1 7.1 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7.1 7.1 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
      </>
    ),
    signout: <path d="M10 17l5-5-5-5M15 12H3M21 4v16h-6" />,
  };

  return (
    <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.target}
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/prospecting', label: 'Prospecting', icon: 'target' },
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/companies', label: 'Companies', icon: 'companies' },
  { to: '/contacts', label: 'Contacts', icon: 'contacts' },
  { to: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
  { to: '/sequences', label: 'Sequences', icon: 'sequences' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/import', label: 'Import', icon: 'import' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  const { toast, fetchMeta, fetchDialerStatus, apiWarning } = useStore();
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

  useEffect(() => {
    if (auth) {
      fetchMeta();
      fetchDialerStatus();
    }
  }, [auth]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setAuth(false);
  };

  if (auth === null) return <div className="login-screen"><div className="muted">Loading...</div></div>;
  if (auth === false) return <Login onSuccess={() => { setAuth(true); fetchMeta(); }} />;

  return (
    <div className={`app${navCollapsed ? ' nav-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="logo">
          <img className="logo-img" src={runwiseLogo} alt="RunWise Systems" />
          {!navCollapsed && <span className="logo-text">Prospecting</span>}
        </div>
        <button className="nav-toggle" onClick={toggleNav} title={navCollapsed ? 'Expand menu' : 'Collapse menu'}>
          {navCollapsed ? '>' : '<'}
        </button>
        <nav>
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-item" data-label={label} title={label}>
              <span className="nav-icon"><NavIcon name={icon} /></span>
              {!navCollapsed && <span className="nav-label">{label}</span>}
            </NavLink>
          ))}
        </nav>
        {authRequired && (
          <button className="sidebar-logout nav-item" data-label="Sign out" title="Sign out" onClick={logout}>
            <span className="nav-icon"><NavIcon name="signout" /></span>
            {!navCollapsed && <span className="nav-label">Sign out</span>}
          </button>
        )}
      </aside>
      <div className="main">
        <header className="topbar">
          <GlobalSearch />
        </header>
        <main className="content">
          {apiWarning && <div className="runtime-warning">{apiWarning}</div>}
          <Suspense fallback={<p className="muted">Loading...</p>}>
            <Routes>
              <Route path="/" element={<Navigate to="/prospecting" replace />} />
              <Route path="/home" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/prospecting" element={<Prospecting />} />
              <Route path="/companies" element={<Companies />} />
              <Route path="/companies/:id" element={<CompanyDetail />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/:id" element={<ContactDetail />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/sequences" element={<Sequences />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/import" element={<Import />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      {toast && <div className={`toast ${toast.isError ? 'error' : ''}`}>{toast.message}</div>}
      <CallLogModal />
    </div>
  );
}
