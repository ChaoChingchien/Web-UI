import React, { useState, useEffect } from 'react';
import { Sidebar } from '../Sidebar/Sidebar';
import { ChatView } from '../Chat/ChatView';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { LogPanel } from '../LogPanel/LogPanel';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => window.api.window.minimize();
  const handleMaximize = () => {
    window.api.window.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.api.window.close();

  return (
    <div className="main-layout">
      {/* 标题栏 */}
      <div className="title-bar title-bar-drag">
        <div className="title-bar-title">Web-AI · 对话</div>
        <div className="title-bar-controls title-bar-no-drag">
          <button className="title-btn" title="日志" onClick={() => setShowLogs(true)}>📋</button>
          <button className="title-btn" title="设置" onClick={() => setShowSettings(true)}>⚙️</button>
          <span className="title-bar-spacer" />
          <button className="title-btn window-btn" title="最小化" onClick={handleMinimize}>─</button>
          <button className="title-btn window-btn" title={isMaximized ? '还原' : '最大化'} onClick={handleMaximize}>
            {isMaximized ? '❐' : '□'}
          </button>
          <button className="title-btn window-btn window-close" title="关闭" onClick={handleClose}>✕</button>
        </div>
      </div>

      {/* 主体区域 */}
      <div className="main-body">
        <Sidebar />
        <ChatView />
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showLogs && <LogPanel onClose={() => setShowLogs(false)} />}
    </div>
  );
};
