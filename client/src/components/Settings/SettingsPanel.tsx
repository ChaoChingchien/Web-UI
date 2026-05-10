import React, { useEffect } from 'react';
import { useTheme } from '../../theme';
import { useSettingsStore } from '../../stores';
import './SettingsPanel.css';

interface SettingsPanelProps {
  onClose: () => void;
}

const ACCENT_COLORS: { key: string; label: string; color: string }[] = [
  { key: 'amber', label: '琥珀', color: '#d97706' },
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
        style={{ width: 480, padding: 0 }}
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
            <label>🔮 语义记忆（嵌入向量）</label>
            <div className="headless-toggle" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                <input
                  type="checkbox"
                  checked={settings.embedding.enabled}
                  onChange={(e) => updateSettings({ embedding: { ...settings.embedding, enabled: e.target.checked } as any })}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  className="toggle-slider"
                  style={{
                    position: 'absolute', cursor: 'pointer', inset: 0,
                    backgroundColor: settings.embedding.enabled ? 'var(--accent-color, #4f46e5)' : '#ccc',
                    borderRadius: 24, transition: '0.3s',
                  }}
                />
                <span
                  className="toggle-knob"
                  style={{
                    position: 'absolute', height: 18, width: 18, left: settings.embedding.enabled ? 23 : 3,
                    bottom: 3, backgroundColor: '#fff', borderRadius: '50%', transition: '0.3s',
                  }}
                />
              </label>
              <span className="setting-hint">
                {settings.embedding.enabled ? '已启用' : '已关闭'}
              </span>
            </div>
            {settings.embedding.enabled && (
              <div style={{ marginTop: 10 }}>
                <div className="setting-hint" style={{ marginBottom: 6 }}>
                  提供者：
                  <select
                    value={settings.embedding.provider}
                    onChange={(e) => updateSettings({ embedding: { ...settings.embedding, provider: e.target.value as 'local' | 'api' } as any })}
                    style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-light)', background: 'var(--bg)', color: 'var(--fg)' }}
                  >
                    <option value="local">本机模型 (all-MiniLM-L6-v2)</option>
                    <option value="api">远程 API</option>
                  </select>
                </div>
                {settings.embedding.provider === 'api' && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      type="text"
                      placeholder="Ollama/OpenAI API 地址"
                      value={settings.embedding.apiUrl}
                      onChange={(e) => updateSettings({ embedding: { ...settings.embedding, apiUrl: e.target.value } as any })}
                      style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-light)', background: 'var(--bg)', color: 'var(--fg)', marginBottom: 6, boxSizing: 'border-box' }}
                    />
                    <input
                      type="text"
                      placeholder="模型名称 (如 nomic-embed-text)"
                      value={settings.embedding.apiModel}
                      onChange={(e) => updateSettings({ embedding: { ...settings.embedding, apiModel: e.target.value } as any })}
                      style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-light)', background: 'var(--bg)', color: 'var(--fg)', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>
            )}
            <p className="setting-hint" style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              启用后，每条消息将生成向量嵌入，用于跨对话的语义相似检索。本机模型需首次下载 ~80MB。
            </p>
          </div>

          <div className="setting-group">
            <label>浏览器运行模式</label>
            <div className="headless-toggle" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                <input
                  type="checkbox"
                  checked={settings.headless}
                  onChange={(e) => updateSettings({ headless: e.target.checked })}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  className="toggle-slider"
                  style={{
                    position: 'absolute', cursor: 'pointer', inset: 0,
                    backgroundColor: settings.headless ? 'var(--accent-color, #4f46e5)' : '#ccc',
                    borderRadius: 24, transition: '0.3s',
                  }}
                />
                <span
                  className="toggle-knob"
                  style={{
                    position: 'absolute', height: 18, width: 18, left: settings.headless ? 23 : 3,
                    bottom: 3, backgroundColor: '#fff', borderRadius: '50%', transition: '0.3s',
                  }}
                />
              </label>
              <span className="setting-hint">
                {settings.headless ? '浏览器在后台运行（不弹窗）' : '显示浏览器窗口'}
              </span>
            </div>
            <p className="setting-hint" style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              开启后，Web 自动化操作将不弹出浏览器窗口，适合批量处理或服务端使用。
            </p>
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
