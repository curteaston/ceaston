import React from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}

export function FormField({ label, required, error, children, hint }: FormFieldProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block',
        fontSize: 12,
        fontWeight: 600,
        color: '#374151',
        marginBottom: 5,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label}{required && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>{error}</div>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export function Input({ hasError, style, ...props }: InputProps) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '8px 12px',
        border: `1px solid ${hasError ? '#DC2626' : '#D1D5DB'}`,
        borderRadius: 7,
        fontSize: 13,
        fontFamily: 'inherit',
        color: '#333540',
        background: '#fff',
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export function Textarea({ hasError, style, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        padding: '8px 12px',
        border: `1px solid ${hasError ? '#DC2626' : '#D1D5DB'}`,
        borderRadius: 7,
        fontSize: 13,
        fontFamily: 'inherit',
        color: '#333540',
        background: '#fff',
        outline: 'none',
        resize: 'vertical',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export function Select({ hasError, style, children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      style={{
        width: '100%',
        padding: '8px 12px',
        border: `1px solid ${hasError ? '#DC2626' : '#D1D5DB'}`,
        borderRadius: 7,
        fontSize: 13,
        fontFamily: 'inherit',
        color: '#333540',
        background: '#fff',
        outline: 'none',
        boxSizing: 'border-box',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </select>
  );
}
