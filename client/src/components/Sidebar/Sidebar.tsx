import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProviderStore, useConversationStore } from '../../stores';
import { SearchPanel } from '../Search/SearchPanel';
import { useToast } from '../Toast';
import './Sidebar.css';

export const Sidebar: React.FC = () => {
  const { providers, activeProviderId, loadProviders, setActiveProvider } = useProviderStore();
  const { conversations, activeConversationId, loadConversations, setActiveConversation, createConversation, deleteConversation, renameConversation } =
    useConversationStore();

  useEffect(() => {
    loadProviders();
  }, []);

  // 提供商列表加载完成后，自动选中第一个
  useEffect(() => {
    if (providers.length > 0 && !activeProviderId) {
      setActiveProvider(providers[0].id);
    }
  }, [providers, activeProviderId]);

  // 当选中提供商变化时，加载对应的对话列表并自动选中最新一条
  useEffect(() => {
    if (activeProviderId) {
      setActiveConversation(null);
      loadConversations(activeProviderId).then(() => {
        const { conversations } = useConversationStore.getState();
        if (conversations.length > 0) {
          setActiveConversation(conversations[0].id);
        }
      });
    }
  }, [activeProviderId]);

  const handleProviderClick = (providerId: string) => {
    if (activeProviderId === providerId) {
      // 点击同一个提供商：主动加载对话（useEffect 不会触发）
      setActiveConversation(null);
      loadConversations(providerId).then(() => {
        const { conversations } = useConversationStore.getState();
        if (conversations.length > 0) {
          setActiveConversation(conversations[0].id);
        }
      });
    } else {
      setActiveProvider(providerId);
      // useEffect 会自动处理对话加载
    }
  };

  const [showSearch, setShowSearch] = useState(false);
  const [filterText, setFilterText] = useState('');
  const { toast } = useToast();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string; title: string } | null>(null);

  // 重命名弹窗
  const [renameDialog, setRenameDialog] = useState<{ id: string; title: string } | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const handleNewConversation = async () => {
    if (!activeProviderId) return;
    // 直接创建，不弹对话框 —— 标题留空，首次回复后自动命名
    const conv = await createConversation(activeProviderId, '新对话');
    await setActiveConversation(conv.id);
  };

  const handleConversationClick = async (convId: string) => {
    if (contextMenu) return;
    await setActiveConversation(convId);
  };

  const handleContextMenu = (e: React.MouseEvent, convId: string, title: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conversationId: convId, title });
  };

  const handleRename = () => {
    if (!contextMenu) return;
    setRenameDialog({ id: contextMenu.conversationId, title: contextMenu.title });
    setRenameTitle(contextMenu.title);
    setContextMenu(null);
  };

  const confirmRename = async () => {
    if (!renameDialog || !renameTitle.trim()) return;
    await renameConversation(renameDialog.id, renameTitle.trim());
    setRenameDialog(null);
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    const id = contextMenu.conversationId;
    setContextMenu(null);
    try {
      await deleteConversation(id);
      toast('success', '对话已删除');
    } catch (err) {
      toast('error', '删除失败');
    }
  };

  return (
    <div className="sidebar">
      {/* 搜索按钮 */}
      <div className="sidebar-search">
        <button className="btn-search" onClick={() => setShowSearch(true)} title="搜索对话">
          🔍 搜索对话 <span style={{ opacity: 0.5, fontSize: 11 }}>(Ctrl+K)</span>
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
        <div className="conversation-filter">
          <input
            className="filter-input"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="过滤对话..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filterText.trim()) {
                setShowSearch(true);
              }
            }}
          />
          {filterText.trim() && (
            <button
              className="btn-filter-search"
              title="搜索消息内容"
              onClick={() => setShowSearch(true)}
            >
              🔍
            </button>
          )}
        </div>
        {conversations
          .filter((conv) => !filterText.trim() || conv.title.toLowerCase().includes(filterText.trim().toLowerCase()))
          .map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
            onClick={() => handleConversationClick(conv.id)}
            onContextMenu={(e) => handleContextMenu(e, conv.id, conv.title)}
          >
            <span className="conv-title">{conv.title}</span>
            <span className="conv-time">{new Date(conv.updated_at).toLocaleDateString()}</span>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="empty-state">暂无对话</div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="context-menu-item" onClick={handleRename}>
              ✏️ 重命名
            </div>
            <div className="context-menu-item danger" onClick={handleDelete}>
              🗑️ 删除
            </div>
          </div>
        </>,
        document.body
      )}

      {/* 重命名弹窗 */}
      {renameDialog && (
        <div className="modal-overlay" onClick={() => setRenameDialog(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === 'Escape') setRenameDialog(null); }}
          >
            <h3>重命名对话</h3>
            <div className="form-group">
              <input
                autoFocus
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                placeholder="输入新标题"
                onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); }}
              />
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setRenameDialog(null)}>取消</button>
              <button className="btn-confirm" onClick={confirmRename}>保存</button>
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
