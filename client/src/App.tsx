import React, { useState, useCallback } from 'react';
import { ThemeProvider } from './theme';
import { MainLayout } from './components/Layout/MainLayout';
import { TeamView } from './components/Team/TeamView';
import { TaskBoard } from './components/TaskBoard/TaskBoard';
import { RoleManager } from './components/RoleManager/RoleManager';
import { ProviderManager } from './components/ProviderManager/ProviderManager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import './styles/global.css';
import './components/Layout/leftNav.css';

type ActiveView = 'chat' | 'team' | 'tasks' | 'roles' | 'providers';

export const OPEN_CONVERSATION_EVENT = 'open-conversation';

// Inline SVG icons to avoid extra dependencies
const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const TeamIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const TaskIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);
const RoleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="10" r="3" />
    <path d="M12 21v-4m0 0a8 8 0 0 0-8-8v12h16V9a8 8 0 0 0-8 8z" />
  </svg>
);
const ProviderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const NAV_ITEMS: { key: ActiveView; Icon: React.FC; label: string }[] = [
  { key: 'chat', Icon: ChatIcon, label: '对话' },
  { key: 'team', Icon: TeamIcon, label: 'AI Team' },
  { key: 'tasks', Icon: TaskIcon, label: '任务看板' },
  { key: 'roles', Icon: RoleIcon, label: '角色管理' },
  { key: 'providers', Icon: ProviderIcon, label: '提供商管理' },
];

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ActiveView>('chat');

  const handleOpenConversation = useCallback((conversationId: string) => {
    setActiveView('chat');
    window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: { conversationId } }));
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <nav className="left-nav">
              {NAV_ITEMS.map(({ key, Icon, label }) => (
                <button
                  key={key}
                  className={`nav-btn ${activeView === key ? 'active' : ''}`}
                  onClick={() => setActiveView(key)}
                  title={label}
                >
                  <Icon />
                </button>
              ))}
            </nav>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeView === 'chat' && <MainLayout />}
              {activeView === 'team' && <TeamView />}
              {activeView === 'tasks' && <TaskBoard onOpenConversation={handleOpenConversation} />}
              {activeView === 'roles' && <RoleManager />}
              {activeView === 'providers' && <ProviderManager />}
            </div>
          </div>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
