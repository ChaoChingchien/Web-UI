import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useConversationStore, useProviderStore } from '../../stores';
import { ExportDialog } from '../Export/ExportDialog';
import { ChatToolbar, type CapabilityTier } from './ChatToolbar';
import { useToast } from '../Toast';
import { OPEN_CONVERSATION_EVENT } from '../../App';
import type { AIProvider } from '@shared/types';
import { marked } from 'marked';
import './ChatView.css';

// Minimal marked config: safe, no XSS
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text) as string;
  } catch {
    return text.replace(/</g, '&lt;');
  }
}

// Parse @mention prefix + apply tier-based provider routing.
// Agent A is adding `capabilities` to AIProvider; until then we read it via any-cast.
function resolveProviderAndMessage(
  raw: string,
  defaultProviderId: string,
  providers: AIProvider[],
  tier: CapabilityTier,
): { providerId: string; message: string; note?: string } {
  // 1) @mention wins
  const mentionMatch = raw.match(/^@(\S+)\s+([\s\S]*)$/);
  if (mentionMatch) {
    const [, name, rest] = mentionMatch;
    const needle = name.toLowerCase();
    const hit = providers.find((p) =>
      p.is_enabled && (p.name.toLowerCase().includes(needle) || p.id.toLowerCase() === needle)
    );
    if (hit) return { providerId: hit.id, message: rest };
    return { providerId: defaultProviderId, message: raw, note: `没找到名为 "${name}" 的提供商，按当前配置发送` };
  }

  // 2) tier-based routing
  const enabled = providers.filter((p) => p.is_enabled);
  const costOrder: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };
  const matching = enabled.filter((p) => {
    const levels = (p as any).capabilities?.best_for_levels as CapabilityTier[] | undefined;
    return Array.isArray(levels) && levels.includes(tier);
  });
  if (matching.length === 0) {
    if (tier !== 'L1') {
      return { providerId: defaultProviderId, message: raw, note: `没有匹配 ${tier} 档的模型，已回退到默认` };
    }
    return { providerId: defaultProviderId, message: raw };
  }
  matching.sort((a, b) => {
    const ca = costOrder[((a as any).capabilities?.cost_tier as 'low' | 'medium' | 'high') ?? 'medium'];
    const cb = costOrder[((b as any).capabilities?.cost_tier as 'low' | 'medium' | 'high') ?? 'medium'];
    return tier === 'L2' ? cb - ca : ca - cb;
  });
  return { providerId: matching[0].id, message: raw };
}

export const ChatView: React.FC = () => {
  const { activeConversationId, conversations, messages, sending, streamingContent, sendMessage, setAutoDispatch, roles } = useConversationStore();
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const { providers, activeProviderId } = useProviderStore();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [tier, setTier] = useState<CapabilityTier>('L1');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const activeProvider = providers.find(p => p.id === activeProviderId);
  const webConfig = activeProvider?.type === 'web' ? activeProvider.web_config : null;
  const modeCfg = webConfig?.modeSelector;
  const modelCfg = webConfig?.modelSelector;
  const toggleCfgs = webConfig?.toggles || [];

  const [currentMode, setCurrentMode] = useState<string>(modeCfg?.defaultMode || '');
  const [currentModel, setCurrentModel] = useState<string>(modelCfg?.defaultModel || '');
  const [toggleStates, setToggleStates] = useState<Record<string, boolean>>(() => {
    const states: Record<string, boolean> = {};
    for (const t of toggleCfgs) states[t.label] = t.defaultOn ?? false;
    return states;
  });

  useEffect(() => {
    setCurrentMode(modeCfg?.defaultMode || '');
    setCurrentModel(modelCfg?.defaultModel || '');
    const states: Record<string, boolean> = {};
    for (const t of toggleCfgs) states[t.label] = t.defaultOn ?? false;
    setToggleStates(states);
  }, [activeProviderId]);

  // Restore persisted tier for the active conversation
  useEffect(() => {
    if (!activeConversationId) return;
    const saved = localStorage.getItem(`chat.tier.${activeConversationId}`);
    if (saved === 'L0' || saved === 'L1' || saved === 'L2') setTier(saved);
    else setTier('L1');
  }, [activeConversationId]);

  const handleTierChange = useCallback((t: CapabilityTier) => {
    if (activeConversationId) {
      localStorage.setItem(`chat.tier.${activeConversationId}`, t);
    }
    setTier(t);
  }, [activeConversationId]);

  // Smart auto-scroll: only scroll if user is near the bottom
  const isNearBottom = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ conversationId: string }>) => {
      useConversationStore.getState().setActiveConversation(e.detail.conversationId);
    };
    window.addEventListener(OPEN_CONVERSATION_EVENT, handler as EventListener);
    return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, handler as EventListener);
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeProviderId || !activeConversationId || sending) return;
    const resolved = resolveProviderAndMessage(trimmed, activeProviderId, providers, tier);
    if (resolved.note) toast('info', resolved.note);
    setInput('');
    await sendMessage(resolved.providerId, activeConversationId, resolved.message, {
      mode: currentMode || undefined,
      model: currentModel || undefined,
      toggles: Object.keys(toggleStates).length > 0 ? toggleStates : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };

  if (!activeConversationId) {
    return (
      <div className="chat-empty">
        <div className="empty-content">
          <h2>选择 AI 开始对话</h2>
          <p>从左侧选择 AI 提供商，或创建一个新对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <div className="chat-header">
        <div className="chat-title">{activeConversation?.title || '对话'}</div>
        <div className="chat-actions">
          <button className="btn btn-sm" onClick={() => setShowExport(true)} title="导出对话">
            导出
          </button>
        </div>
      </div>

      <ChatToolbar
        modeCfg={modeCfg}
        modelCfg={modelCfg}
        toggleCfgs={toggleCfgs}
        currentMode={currentMode}
        currentModel={currentModel}
        toggleStates={toggleStates}
        onModeChange={setCurrentMode}
        onModelChange={setCurrentModel}
        onToggleChange={(label) => setToggleStates(prev => ({ ...prev, [label]: !prev[label] }))}
        autoDispatch={!!activeConversation?.auto_dispatch}
        autoDispatchDisabled={!activeConversationId}
        onAutoDispatchToggle={() => {
          if (!activeConversationId) return;
          setAutoDispatch(activeConversationId, !activeConversation?.auto_dispatch);
        }}
        tier={tier}
        onTierChange={handleTierChange}
      />

      <div className="message-list" ref={messageListRef}>
        {messages.map((msg) => {
          const dispatchedRole = msg.role === 'assistant' && msg.dispatched_role_id
            ? roles.find((r) => r.id === msg.dispatched_role_id)
            : undefined;
          return (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : (dispatchedRole?.icon || '🤖')}
              </div>
              <div className="message-content">
                <div className="message-role">
                  {msg.role === 'user' ? '你' : 'AI'}
                  <span className="message-time">{new Date(msg.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="message-bubble-wrap">
                  {msg.role === 'assistant' && msg.dispatched_role_id && (
                    <span
                      className="dispatched-role-badge"
                      title={msg.dispatch_reason || ''}
                    >
                      <span className="dispatched-role-icon">{dispatchedRole?.icon || '🎯'}</span>
                      <span className="dispatched-role-name">
                        {dispatchedRole?.name || msg.dispatched_role_id}
                      </span>
                    </span>
                  )}
                  <div
                    className="message-text"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {sending && !streamingContent && (
          <div className="message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        {streamingContent && (
          <div className="message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="message-role">AI <span className="message-time">{new Date().toLocaleTimeString()}</span></div>
              <div
                className="message-text"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          disabled={sending}
        />
        <button
          className="btn btn-primary send-btn"
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          发送
        </button>
      </div>
      <div className="chat-input-hint">提示：输入 @提供商名 开头可临时切换，如 @claude 写首诗</div>

      {showExport && activeConversationId && (
        <ExportDialog conversationId={activeConversationId} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
};
