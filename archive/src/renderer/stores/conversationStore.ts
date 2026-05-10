import { create } from 'zustand';
import type { Conversation, Message } from '@shared/types';

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  streamingContent: string;

  // Actions
  loadConversations: (providerId?: string) => Promise<void>;
  setActiveConversation: (id: string | null) => Promise<void>;
  createConversation: (providerId: string, title: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (providerId: string, conversationId: string, content: string) => Promise<void>;
  addMessage: (message: Message) => void;
  appendStreamChunk: (chunk: string) => void;
  setStreamingContent: (content: string) => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  loading: false,
  sending: false,
  streamingContent: '',

  loadConversations: async (providerId) => {
    set({ loading: true });
    try {
      const conversations = await window.api.conversation.list(providerId);
      set({ conversations });
    } finally {
      set({ loading: false });
    }
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, streamingContent: '' });
    if (id) {
      const messages = await window.api.conversation.messages(id);
      set({ messages });
    } else {
      set({ messages: [] });
    }
  },

  createConversation: async (providerId, title) => {
    const conv = await window.api.conversation.create(providerId, title);
    await get().loadConversations();
    return conv;
  },

  deleteConversation: async (id) => {
    await window.api.conversation.delete(id);
    const { activeConversationId } = get();
    if (activeConversationId === id) {
      set({ activeConversationId: null, messages: [], streamingContent: '' });
    }
    await get().loadConversations();
  },

  sendMessage: async (providerId, conversationId, content) => {
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

      const unsubComplete = window.api.chat.onComplete(({ conversationId: cid, messageId }) => {
        if (cid === conversationId) {
          const streamingContent = get().streamingContent;
          if (streamingContent) {
            const replyMsg: Message = {
              id: messageId,
              conversation_id: conversationId,
              role: 'assistant',
              content: streamingContent,
              created_at: new Date().toISOString(),
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
      await window.api.chat.send({ providerId, conversationId, message: content });
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
}));
