import React from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 28,
      paddingBottom: 20,
      borderBottom: '1px solid #E5E7EB',
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#2F3C7E', letterSpacing: -0.3 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10 }}>{actions}</div>}
    </div>
  );
}
