import React from 'react';

interface Props {
  fullscreen?: boolean;
  text?: string;
  size?: number;
}

export const LoadingSpinner: React.FC<Props> = ({ fullscreen = false, text, size = 32 }) => {
  const spinner = (
    <div style={{
      width: size, height: size,
      border: '3px solid var(--border-light)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.6s linear infinite',
    }} />
  );

  if (fullscreen) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 12,
      }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {spinner}
        {text && <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)' }}>{text}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {spinner}
      {text && <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{text}</span>}
    </div>
  );
};
