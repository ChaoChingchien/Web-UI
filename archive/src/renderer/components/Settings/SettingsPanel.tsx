import React, { useState, useEffect } from 'react';
import { useTheme } from '../../theme';
import type { AppSettings } from '@shared/types';
import './SettingsPanel.css';

interface SettingsPanelProps {
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { theme, setTheme } = useTheme();
  const [settings, setLocalSettings] = useState<AppSettings>({ theme, sidebarCollapsed: false, sidebarWidth: 260 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      window.api.settings.get().then((s) => {
        setLocalSettings(s);
        setLoaded(true);
      });
    }
  }, [loaded]);

  const handleSave = async () => {
    await window.api.settings.set(settings);
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>⚙️ 设置</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <div className="setting-group">
            <label>主题</label>
            <div className="theme-options">
              <button
                className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                onClick={() => { setTheme('light'); }}
              >
                ☀️ 浅色
              </button>
              <button
                className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => { setTheme('dark'); }}
              >
                🌙 深色
              </button>
              <button
                className={`theme-option ${theme === 'system' ? 'active' : ''}`}
                onClick={() => { setTheme('system'); }}
              >
                💻 跟随系统
              </button>
            </div>
          </div>

          <div className="setting-group">
            <label>版本</label>
            <p className="setting-value">Web-AI v0.1.0</p>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn-save" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
};
