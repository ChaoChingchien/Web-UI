import { create } from 'zustand';
import type { Conversation, Message, AIRole } from '@shared/types';

// Augment shared types so auto_dispatch / dispatched_role_id / dispatch_reason
// are visible to this module even before Agent B's type changes land.
// The declarations merge with the original interfaces at compile time.
declare module '@shared/types' {
  interface Conversation {
    auto_dispatch?: boolean;
  }
  interface Message {
    dispatched_role_id?: string;
    dispatch_reason?: string;
  }
}

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  streamingContent: string;
  roles: AIRole[];
  rolesLoaded: boolean;

  // Actions
  loadConversations: (providerId?: string) => Promise<void>;
  setActiveConversation: (id: string | null) => Promise<void>;
  createConversation: (providerId: string, title: string, opts?: { agent?: boolean; agentPrompt?: string }) => Promise<Conversation>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (providerId: string, conversationId: string, content: string, options?: { mode?: string; model?: string; toggles?: Record<string, boolean> }) => Promise<void>;
  addMessage: (message: Message) => void;
  appendStreamChunk: (chunk: string) => void;
  setStreamingContent: (content: string) => void;
  clearError: () => void;
  setAutoDispatch: (conversationId: string, enabled: boolean) => Promise<void>;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  loadRoles: () => Promise<void>;
}

let loadConversationsVersion = 0;

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  loading: false,
  error: null,
  sending: false,
  streamingContent: '',
  roles: [],
  rolesLoaded: false,

  loadConversations: async (providerId) => {
    const version = ++loadConversationsVersion;
    set({ loading: true, error: null });
    try {
      const conversations = await window.api.conversation.list(providerId);
      if (version !== loadConversationsVersion) return; // stale response
      // Normalize auto_dispatch in case the server sends 0/1 instead of boolean
      const normalized = conversations.map((c) => ({
        ...c,
        auto_dispatch: c.auto_dispatch === true || (c.auto_dispatch as unknown) === 1,
      }));
      set({ conversations: normalized });
    } catch (err) {
      if (version !== loadConversationsVersion) return;
      console.error('加载对话失败:', err);
      set({ conversations: [], error: '加载对话列表失败' });
    } finally {
      if (version === loadConversationsVersion) {
        set({ loading: false });
      }
    }
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, streamingContent: '' });
    if (id) {
      const messages = await window.api.conversation.messages(id);
      set({ messages });
      // Lazy-load roles the first time a conversation is opened so
      // message bubbles can resolve dispatched role names/icons.
      if (!get().rolesLoaded) {
        get().loadRoles();
      }
    } else {
      set({ messages: [] });
    }
  },

  createConversation: async (providerId, title, opts) => {
    const conv = await window.api.conversation.create(providerId, title, opts);
    await get().loadConversations(providerId);
    return conv;
  },

  renameConversation: async (id: string, title: string) => {
    await window.api.conversation.update(id, { title });
    const { activeConversationId } = get();
    // 找到当前对话所属的 provider 以保持过滤
    const conv = get().conversations.find(c => c.id === (activeConversationId || id));
    await get().loadConversations(conv?.provider_id);
  },

  deleteConversation: async (id) => {
    await window.api.conversation.delete(id);
    const { activeConversationId } = get();
    if (activeConversationId === id) {
      set({ activeConversationId: null, messages: [], streamingContent: '' });
    }
    // 找到被删对话所属的 provider 以保持过滤
    const conv = get().conversations.find(c => c.id === id);
    await get().loadConversations(conv?.provider_id);
  },

  sendMessage: async (providerId, conversationId, content, options?: { mode?: string; model?: string; toggles?: Record<string, boolean> }) => {
    set({ sending: true, streamingContent: '' });
    try {
      // 先保存用户消息
      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      };
      set((state) => ({ messages: [...state.messages, userMsg] }));

      // 监听流式回复
      const unsubStream = window.api.chat.onStream(({ conversationId: cid, chunk }) => {
        if (cid === conversationId) {
          get().appendStreamChunk(chunk);
        }
      });

      const unsubComplete = window.api.chat.onComplete(({ conversationId: cid, messageId, dispatchedRole }) => {
        if (cid === conversationId) {
          const streamingContent = get().streamingContent;
          if (streamingContent) {
            const replyMsg: Message = {
              id: messageId,
              conversation_id: conversationId,
              role: 'assistant',
              content: streamingContent,
              created_at: new Date().toISOString(),
              ...(dispatchedRole ? {
                dispatched_role_id: dispatchedRole.id,
                dispatch_reason: dispatchedRole.reason,
              } : {}),
            };
            set((state) => ({
              messages: [...state.messages, replyMsg],
              streamingContent: '',
              sending: false,
            }));
          } else {
            set({ sending: false });
          }
          unsubStream();
          unsubComplete();
        }
      });

      const unsubError = window.api.chat.onError((error) => {
        const streamingContent = get().streamingContent;
        const errorMsg = streamingContent
          ? `${streamingContent}\n\n[错误] ${error.message}`
          : `[错误] ${error.message}`;
        const errMsg: Message = {
          id: `err-${Date.now()}`,
          conversation_id: conversationId,
          role: 'assistant',
          content: errorMsg,
          created_at: new Date().toISOString(),
        };
        set((state) => ({
          messages: [...state.messages, errMsg],
          streamingContent: '',
          sending: false,
        }));
        unsubStream();
        unsubComplete();
        unsubError();
      });

      // 发送到主进程进行自动化
      await window.api.chat.send({
        providerId,
        conversationId,
        message: content,
        mode: options?.mode,
        model: options?.model,
        toggles: options?.toggles,
      });
    } catch (err) {
      set({ sending: false, streamingContent: '' });
    }
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages.filter((m) => m.id !== 'temp-' + message.id), message],
    }));
  },

  appendStreamChunk: (chunk) => {
    set((state) => ({ streamingContent: state.streamingContent + chunk }));
  },

  setStreamingContent: (content) => {
    set({ streamingContent: content });
  },

  clearError: () => {
    set({ error: null });
  },

  setAutoDispatch: async (conversationId, enabled) => {
    await window.api.conversation.setAutoDispatch(conversationId, enabled);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, auto_dispatch: enabled } : c
      ),
    }));
  },

  updateConversation: (id, data) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    }));
  },

  loadRoles: async () => {
    try {
      const roles = await window.api.role.list();
      set({ roles, rolesLoaded: true });
    } catch (err) {
      console.error('加载角色失败:', err);
      set({ rolesLoaded: true });
    }
  },
}));
