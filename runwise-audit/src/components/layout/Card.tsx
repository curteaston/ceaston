import React from 'react';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, style, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        padding: 20,
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick ? 'box-shadow 0.15s' : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  subtext?: string;
}

export function StatCard({ label, value, color = '#2F3C7E', subtext }: StatCardProps) {
  return (
    <Card>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      {subtext && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>{subtext}</div>}
    </Card>
  );
}
