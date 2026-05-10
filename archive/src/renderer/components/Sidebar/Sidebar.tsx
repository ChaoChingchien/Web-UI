import React, { useEffect, useState } from 'react';
import { useProviderStore, useConversationStore } from '../../stores';
import { SearchPanel } from '../Search/SearchPanel';
import './Sidebar.css';

export const Sidebar: React.FC = () => {
  const { providers, activeProviderId, loadProviders, setActiveProvider } = useProviderStore();
  const { conversations, activeConversationId, loadConversations, setActiveConversation, createConversation } =
    useConversationStore();

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    if (activeProviderId) {
      loadConversations(activeProviderId);
    }
  }, [activeProviderId]);

  const handleProviderClick = (providerId: string) => {
    setActiveProvider(providerId);
  };

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filterText, setFilterText] = useState('');

  const handleNewConversation = () => {
    setNewTitle('');
    setShowNewDialog(true);
  };

  const confirmNewConversation = async () => {
    if (!activeProviderId) return;
    const title = newTitle.trim() || '新对话';
    const conv = await createConversation(activeProviderId, title);
    await setActiveConversation(conv.id);
    setShowNewDialog(false);
    setNewTitle('');
  };

  const handleConversationClick = async (convId: string) => {
    await setActiveConversation(convId);
  };

  return (
    <div className="sidebar">
      {/* 搜索按钮 */}
      <div className="sidebar-search">
        <button className="btn-search" onClick={() => setShowSearch(true)} title="搜索对话">
          🔍 搜索对话
        </button>
      </div>

      {/* AI 提供商列表 */}
      <div className="provider-list">
        <div className="section-title">AI 提供商</div>
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`provider-item ${activeProviderId === provider.id ? 'active' : ''}`}
            onClick={() => handleProviderClick(provider.id)}
            title={provider.name}
          >
            <span className="provider-icon">{provider.icon}</span>
            <span className="provider-name">{provider.name}</span>
          </div>
        ))}
      </div>

      {/* 对话列表 */}
      <div className="conversation-list">
        <div className="section-header">
          <div className="section-title">对话</div>
          <button className="btn-new" onClick={handleNewConversation} title="新建对话">
            +
          </button>
        </div>
        {conversations.length > 3 && (
          <div className="conversation-filter">
            <input
              className="filter-input"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="过滤对话..."
            />
          </div>
        )}
        {conversations
          .filter((conv) => !filterText.trim() || conv.title.toLowerCase().includes(filterText.trim().toLowerCase()))
          .map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
            onClick={() => handleConversationClick(conv.id)}
          >
            <span className="conv-title">{conv.title}</span>
            <span className="conv-time">{new Date(conv.updated_at).toLocaleDateString()}</span>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="empty-state">暂无对话</div>
        )}
      </div>

      {/* 新建对话弹窗 */}
      {showNewDialog && (
        <div className="modal-overlay" onClick={() => setShowNewDialog(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <h3>新建对话</h3>
            <div className="form-group">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="输入对话标题（可选）"
                onKeyDown={(e) => { if (e.key === 'Enter') confirmNewConversation(); }}
              />
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowNewDialog(false)}>取消</button>
              <button className="btn-confirm" onClick={confirmNewConversation}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 搜索面板 */}
      {showSearch && (
        <SearchPanel
          onSelectConversation={(convId) => { setActiveConversation(convId); }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
};
