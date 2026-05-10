import React, { useEffect } from 'react';
import { useTheme } from '../../theme';
import { useSettingsStore } from '../../stores';
import './SettingsPanel.css';

interface SettingsPanelProps {
  onClose: () => void;
}

const ACCENT_COLORS: { key: string; label: string; color: string }[] = [
  { key: 'indigo', label: '靛蓝', color: '#4f46e5' },
  { key: 'blue', label: '蓝色', color: '#2563eb' },
  { key: 'green', label: '绿色', color: '#059669' },
  { key: 'orange', label: '橙色', color: '#ea580c' },
  { key: 'pink', label: '粉色', color: '#db2777' },
  { key: 'teal', label: '青色', color: '#0d9488' },
  { key: 'violet', label: '紫色', color: '#7c3aed' },
  { key: 'rose', label: '玫瑰', color: '#e11d48' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const { settings, loadSettings, updateSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings().then(() => {
      setTheme(settings.theme);
    });
  }, []);

  const handleThemeChange = (t: 'light' | 'dark' | 'system') => {
    setTheme(t);
    updateSettings({ theme: t });
  };

  const handleSave = async () => {
    await updateSettings(settings);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal settings-panel"
        style={{ width: 420, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            handleSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        <div className="settings-header">
          <h3>设置</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body" style={{ padding: 20 }}>
          <div className="setting-group">
            <label>主题</label>
            <div className="theme-options">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  className={`theme-option ${theme === t ? 'active' : ''}`}
                  onClick={() => handleThemeChange(t)}
                >
                  {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <label>强调色</label>
            <div className="accent-colors">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.key}
                  className={`accent-color-btn ${accentColor === c.key ? 'active' : ''}`}
                  style={{ backgroundColor: c.color }}
                  onClick={() => setAccentColor(c.key)}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="setting-group">
            <label>数据管理</label>
            <p className="setting-hint">所有对话和设置均存储在本地 SQLite 数据库中。</p>
          </div>

          <div className="setting-group">
            <label>版本</label>
            <p className="setting-value">Web-AI v2.0.0</p>
          </div>
        </div>

        <div className="settings-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave}>关闭</button>
        </div>
      </div>
    </div>
  );
};
