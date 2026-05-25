import React, { useEffect } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  actions?: React.ReactNode;
}

export function Modal({ title, onClose, children, width = 640, actions }: ModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: width,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #E5E7EB',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2F3C7E' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
              color: '#9CA3AF', padding: '0 4px', fontFamily: 'inherit',
            }}
          >×</button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        {actions && (
          <div style={{
            padding: '16px 24px', borderTop: '1px solid #E5E7EB',
            display: 'flex', gap: 10, justifyContent: 'flex-end',
          }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
