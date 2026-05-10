import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useConversationStore, useProviderStore } from '../../stores';
import { ExportDialog } from '../Export/ExportDialog';
import { OPEN_CONVERSATION_EVENT } from '../../App';
import './ChatView.css';

export const ChatView: React.FC = () => {
  const { activeConversationId, conversations, messages, sending, streamingContent, sendMessage } = useConversationStore();
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const { activeProviderId } = useProviderStore();
  const [input, setInput] = useState('');
  const [showExport, setShowExport] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // 监听来自 TaskBoard 的跳转对话事件
  useEffect(() => {
    const handler = (e: CustomEvent<{ conversationId: string }>) => {
      const { conversationId } = e.detail;
      useConversationStore.getState().setActiveConversation(conversationId);
    };
    window.addEventListener(OPEN_CONVERSATION_EVENT, handler as EventListener);
    return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, handler as EventListener);
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeProviderId || !activeConversationId || sending) return;

    setInput('');
    await sendMessage(activeProviderId, activeConversationId, trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 空状态
  if (!activeConversationId) {
    return (
      <div className="chat-empty">
        <div className="empty-content">
          <span className="empty-icon">💬</span>
          <h2>选择一个 AI 开始对话</h2>
          <p>从左侧选择 AI 提供商，或创建一个新对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      {/* 聊天头部 */}
      <div className="chat-header">
        <div className="chat-title">{activeConversation?.title || '对话'}</div>
        <div className="chat-actions">
          <button className="btn-export" onClick={() => setShowExport(true)} title="导出对话">
            📤 导出
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="message-list">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-content">
              <div className="message-role">
                {msg.role === 'user' ? '你' : 'AI'}
                <span className="message-time">
                  {new Date(msg.created_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-text">{msg.content}</div>
            </div>
          </div>
        ))}

        {sending && !streamingContent && (
          <div className="message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {streamingContent && (
          <div className="message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="message-role">
                AI
                <span className="message-time">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>
              <div className="message-text">{streamingContent}</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          disabled={sending}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          发送
        </button>
      </div>

      {/* 导出对话框 */}
      {showExport && activeConversationId && (
        <ExportDialog conversationId={activeConversationId} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
};
