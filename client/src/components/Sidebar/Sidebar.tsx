import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProviderStore, useConversationStore } from '../../stores';
import { SearchPanel } from '../Search/SearchPanel';
import { useToast } from '../Toast';
import './Sidebar.css';

export const Sidebar: React.FC = () => {
  const { providers, activeProviderId, loadProviders, setActiveProvider } = useProviderStore();
  const { conversations, activeConversationId, loadConversations, setActiveConversation, createConversation, deleteConversation, renameConversation, roles, loadRoles, rolesLoaded } =
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string; title: string } | null>(null);

  // 重命名弹窗
  const [renameDialog, setRenameDialog] = useState<{ id: string; title: string } | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentRoleSearch, setAgentRoleSearch] = useState('');
  const [showRolePicker, setShowRolePicker] = useState(false);

  // Ensure roles are loaded when agent dialog opens
  useEffect(() => {
    if (showAgentDialog && !rolesLoaded) loadRoles();
  }, [showAgentDialog, rolesLoaded, loadRoles]);

  const handleNewConversation = async () => {
    if (!activeProviderId) return;
    // 直接创建，不弹对话框 —— 标题留空，首次回复后自动命名
    const conv = await createConversation(activeProviderId, '新对话');
    await setActiveConversation(conv.id);
  };

  const handleNewAgent = async () => {
    if (!activeProviderId || !agentName.trim()) return;
    const title = agentName.trim().length > 50 ? agentName.trim().slice(0, 50) + '...' : agentName.trim();
    const conv = await createConversation(activeProviderId, title, {
      agent: true,
      agentPrompt: agentPrompt.trim() || undefined,
    });
    await setActiveConversation(conv.id);
    // 同步启用 agent_mode
    try { await window.api.conversation.setAgentMode(conv.id, true, agentPrompt.trim() || undefined); } catch { /* */ }
    setShowAgentDialog(false);
    setAgentName('');
    setAgentPrompt('');
    toast('success', 'Agent 已创建');
  };

  const handleConversationClick = async (convId: string) => {
    if (contextMenu) return;
    if (selectedIds.size > 0) {
      // 多选模式下点击切换选择
      toggleSelect(convId);
      return;
    }
    await setActiveConversation(convId);
  };

  const toggleSelect = (convId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(convId)) next.delete(convId); else next.add(convId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filtered = conversations.filter((c) => !filterText.trim() || c.title.toLowerCase().includes(filterText.trim().toLowerCase()));
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  const batchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    let ok = 0;
    for (const id of selectedIds) {
      try { await deleteConversation(id); ok++; } catch { /* skip */ }
    }
    setSelectedIds(new Set());
    toast('success', `已删除 ${ok} 个对话`);
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
            {provider.type === 'web' && (
              <button
                className="btn-sync-all"
                title="同步网页对话列表"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const r = await window.api.provider.syncConversations(provider.id);
                    const parts = [`导入 ${r.imported} 对话`];
                    if ((r as any).messages) parts.push(`${(r as any).messages} 条消息`);
                    if ((r as any).removed) parts.push(`清理 ${(r as any).removed} 已删除`);
                    toast('success', parts.join('，'));
                    loadConversations(provider.id);
                  } catch { toast('error', '同步失败'); }
                }}
              >
                ↻
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 对话列表 */}
      <div className="conversation-list">
        <div className="section-header">
          <div className="section-title">对话</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn-new" onClick={toggleSelectAll} title="全选">☐</button>
            <button className="btn-new" onClick={() => { setShowAgentDialog(true); setAgentName(''); setAgentPrompt(''); }} title="新建 Agent">🤖</button>
            <button className="btn-new" onClick={handleNewConversation} title="新建对话">+</button>
          </div>
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
        {/* 批量操作栏 */}
        {selectedIds.size > 0 && (
          <div className="batch-bar">
            <span className="batch-count">已选 {selectedIds.size} 个</span>
            <button className="batch-btn batch-btn-danger" onClick={batchDelete}>🗑️ 删除</button>
            <button className="batch-btn" onClick={() => setSelectedIds(new Set())}>取消</button>
          </div>
        )}

        {conversations
          .filter((conv) => !filterText.trim() || conv.title.toLowerCase().includes(filterText.trim().toLowerCase()))
          .map((conv) => {
            const isSelected = selectedIds.has(conv.id);
            return (
          <div
            key={conv.id}
            className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''} ${isSelected ? 'multi-selected' : ''}`}
            onClick={() => handleConversationClick(conv.id)}
            onContextMenu={(e) => handleContextMenu(e, conv.id, conv.title)}
          >
            <span className={`conv-checkbox ${isSelected ? 'checked' : ''}`} onClick={(e) => {
              e.stopPropagation();
              toggleSelect(conv.id);
            }}>{
              isSelected ? '☑' : '☐'
            }</span>
            <span className="conv-info">
              <span className="conv-title">{conv.title}</span>
              <span className="conv-time">{new Date(conv.updated_at).toLocaleDateString()}</span>
            </span>
            {conv.web_url && (
              <button
                className="btn-sync-msg"
                title="同步网页消息"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const r = await window.api.conversation.sync(conv.id);
                    toast('success', `导入了 ${r.imported} 条消息`);
                    if (conv.id === activeConversationId) {
                      setActiveConversation(conv.id);
                    }
                  } catch { toast('error', '同步失败'); }
                }}
              >
                ↻
              </button>
            )}
          </div>
        )})}
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

      {/* Agent 创建弹窗 */}
      {showAgentDialog && (
        <div className="modal-overlay" onClick={() => setShowAgentDialog(false)}>
          <div className="modal" style={{ width: 560, maxHeight: '85vh', padding: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowAgentDialog(false); }}
          >
            <h3>创建 Agent</h3>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Agent 名称</label>
              <input
                className="input"
                autoFocus
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="如：代码审查助手"
                onKeyDown={(e) => { if (e.key === 'Enter' && agentName.trim()) handleNewAgent(); }}
              />
            </div>
            {/* 角色库快速选择 */}
            <div className="form-group" style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>或从角色库选择</span>
                <button
                  className="btn btn-xs"
                  style={{ fontSize: 11 }}
                  onClick={() => setShowRolePicker(!showRolePicker)}
                >
                  {showRolePicker ? '收起 ▲' : '展开 ▼'} ({roles.length} 个角色)
                </button>
              </label>
              {showRolePicker && (
                <div style={{ marginTop: 6 }}>
                  <input
                    className="input"
                    style={{ marginBottom: 6 }}
                    value={agentRoleSearch}
                    onChange={(e) => setAgentRoleSearch(e.target.value)}
                    placeholder="搜索角色..."
                  />
                  <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)' }}>
                    {roles
                      .filter((r) => !agentRoleSearch.trim() ||
                        r.name.toLowerCase().includes(agentRoleSearch.trim().toLowerCase()) ||
                        (r.system_prompt || '').toLowerCase().includes(agentRoleSearch.trim().toLowerCase()))
                      .map((role) => (
                        <div
                          key={role.id}
                          className="agent-role-item"
                          style={{
                            padding: '8px 10px', cursor: 'pointer', fontSize: 12,
                            borderBottom: '1px solid var(--border-light)',
                            display: 'flex', alignItems: 'center', gap: 6,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span
                            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
                            onClick={() => {
                              setAgentName(role.name);
                              setAgentPrompt(role.system_prompt || '');
                              setShowRolePicker(false);
                              setAgentRoleSearch('');
                            }}
                            title={role.system_prompt?.substring(0, 200)}
                          >
                            <span>{role.icon}</span>
                            <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{role.name}</span>
                            <span style={{ opacity: 0.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {(role.system_prompt || '').substring(0, 40)}
                            </span>
                          </span>
                          <button
                            className="btn btn-xs btn-primary"
                            style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!activeProviderId) return;
                              const title = role.name.length > 50 ? role.name.slice(0, 50) + '...' : role.name;
                              const conv = await createConversation(activeProviderId, title, {
                                agent: true,
                                agentPrompt: role.system_prompt || undefined,
                              });
                              await setActiveConversation(conv.id);
                              try { await window.api.conversation.setAgentMode(conv.id, true, role.system_prompt || undefined); } catch { /* */ }
                              setShowAgentDialog(false);
                              setShowRolePicker(false);
                              setAgentName('');
                              setAgentPrompt('');
                              setAgentRoleSearch('');
                              toast('success', `Agent "${role.name}" 已创建`);
                            }}
                          >
                            ⚡ 创建
                          </button>
                        </div>
                      ))}
                    {roles.filter((r) => !agentRoleSearch.trim() ||
                      r.name.toLowerCase().includes(agentRoleSearch.trim().toLowerCase()) ||
                      (r.system_prompt || '').toLowerCase().includes(agentRoleSearch.trim().toLowerCase())).length === 0 && (
                      <div style={{ padding: 8, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                        {roles.length === 0 ? '角色库为空' : '无匹配角色'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>系统提示词（可编辑）</label>
              <textarea
                className="input"
                rows={5}
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder="定义 Agent 的身份和行为，如：你是一个经验丰富的代码审查专家..."
                style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
              Agent 模式下可在对话中随时切换 AI 提供商，所有上下文自动桥接。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => setShowAgentDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleNewAgent} disabled={!agentName.trim()}>创建</button>
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
