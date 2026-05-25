import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
}

const STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: '#2F3C7E', color: '#fff', border: '1px solid #2F3C7E' },
  accent: { background: '#F4C95D', color: '#1a1a2e', border: '1px solid #F4C95D' },
  secondary: { background: '#fff', color: '#2F3C7E', border: '1px solid #2F3C7E' },
  danger: { background: '#fff', color: '#DC2626', border: '1px solid #DC2626' },
  ghost: { background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB' },
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { fontSize: 12, padding: '5px 12px', borderRadius: 6 },
  md: { fontSize: 13, padding: '8px 16px', borderRadius: 7 },
  lg: { fontSize: 14, padding: '10px 20px', borderRadius: 8 },
};

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', style }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...STYLES[variant],
        ...SIZE_STYLES[size],
        fontFamily: 'inherit',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.15s, box-shadow 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
