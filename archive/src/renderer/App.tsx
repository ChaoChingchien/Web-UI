import React, { useState, useCallback } from 'react';
import { ThemeProvider } from './theme';
import { MainLayout } from './components/Layout/MainLayout';
import { TeamView } from './components/Team/TeamView';
import { TaskBoard } from './components/TaskBoard/TaskBoard';
import { RoleManager } from './components/RoleManager/RoleManager';
import { ProviderManager } from './components/ProviderManager/ProviderManager';
import './styles/global.css';

type ActiveView = 'chat' | 'team' | 'tasks' | 'roles' | 'providers';

// 自定义事件名，用于跨视图跳转对话
export const OPEN_CONVERSATION_EVENT = 'open-conversation';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ActiveView>('chat');

  const handleOpenConversation = useCallback((conversationId: string) => {
    setActiveView('chat');
    // 通知 MainLayout 切换到指定对话
    window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: { conversationId } }));
  }, []);

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', height: '100%', width: '100%' }}>
        {/* 左侧导航 */}
        <nav className="left-nav">
          <button
            className={`nav-btn ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveView('chat')}
            title="对话"
          >
            💬
          </button>
          <button
            className={`nav-btn ${activeView === 'team' ? 'active' : ''}`}
            onClick={() => setActiveView('team')}
            title="AI Team"
          >
            👥
          </button>
          <button
            className={`nav-btn ${activeView === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveView('tasks')}
            title="任务看板"
          >
            📋
          </button>
          <button
            className={`nav-btn ${activeView === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveView('roles')}
            title="角色管理"
          >
            🎭
          </button>
          <button
            className={`nav-btn ${activeView === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveView('providers')}
            title="提供商管理"
          >
            🔌
          </button>
        </nav>

        {/* 主内容区 */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeView === 'chat' && <MainLayout />}
          {activeView === 'team' && <TeamView />}
          {activeView === 'tasks' && <TaskBoard onOpenConversation={handleOpenConversation} />}
          {activeView === 'roles' && <RoleManager />}
          {activeView === 'providers' && <ProviderManager />}
        </div>
      </div>

      {/* 左侧导航样式 */}
      <style>{`
        .left-nav {
          width: 48px;
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border-light);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 0;
          gap: 4px;
          flex-shrink: 0;
        }
        .nav-btn {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: var(--radius-md);
          background: transparent;
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition-fast);
        }
        .nav-btn:hover {
          background: var(--bg-sidebar-hover);
        }
        .nav-btn.active {
          background: var(--bg-sidebar-active);
        }
      `}</style>
    </ThemeProvider>
  );
};

export default App;
