import React from 'react';

type NavItem = {
  id: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◼' },
  { id: 'prospects', label: 'Prospects', icon: '◆' },
  { id: 'audit', label: 'Audit Workspace', icon: '◉' },
  { id: 'reports', label: 'Reports', icon: '▦' },
  { id: 'followups', label: 'Follow-Ups', icon: '◷' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

interface SidebarProps {
  active: string;
  onNavigate: (id: string) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <div
      className="sidebar no-print"
      style={{
        width: 220,
        minHeight: '100vh',
        backgroundColor: '#2F3C7E',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      {/* Logo area */}
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#F4C95D', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
          RunWise Systems
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
          Paid Lead Leak Audit
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 20px',
                background: isActive ? 'rgba(244,201,93,0.15)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '3px solid #F4C95D' : '3px solid transparent',
                color: isActive ? '#F4C95D' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.8 }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Internal badge */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: '#F4C95D',
          background: 'rgba(244,201,93,0.15)',
          border: '1px solid rgba(244,201,93,0.3)',
          borderRadius: 4,
          padding: '4px 8px',
          textAlign: 'center',
        }}>
          Internal Use Only
        </div>
      </div>
    </div>
  );
}
