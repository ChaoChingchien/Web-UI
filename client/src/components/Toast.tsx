import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  exiting: boolean;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

const ICONS: Record<ToastType, string> = {
  success: '✓', error: '✕', warning: '⚠', info: 'ℹ',
};

const COLORS: Record<ToastType, string> = {
  success: 'var(--success)', error: 'var(--danger)',
  warning: 'var(--warning)', info: 'var(--accent)',
};

let nextId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, exiting: false }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 'var(--z-toast)',
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)',
            fontSize: 'var(--font-size-base)', pointerEvents: 'auto',
            animation: t.exiting ? 'toast-out 300ms ease forwards' : 'toast-in 300ms ease',
            maxWidth: 360,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              background: COLORS[t.type], color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {ICONS[t.type]}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toast-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
      `}</style>
    </ToastContext.Provider>
  );
};
