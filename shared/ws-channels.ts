/** WebSocket 消息通道常量 */

// Chat streaming
export const WS_CHAT_SEND = 'chat:send' as const;
export const WS_CHAT_STREAM = 'chat:stream' as const;
export const WS_CHAT_COMPLETE = 'chat:complete' as const;
export const WS_CHAT_ERROR = 'chat:error' as const;

// Conversation CRUD sync
export const WS_CONVERSATION_CREATED = 'conversation:created' as const;
export const WS_CONVERSATION_UPDATED = 'conversation:updated' as const;
export const WS_CONVERSATION_DELETED = 'conversation:deleted' as const;

// Team execution
export const WS_TEAM_LOG = 'team:log' as const;

// System logs
export const WS_LOG_NEW = 'log:new' as const;

export type WsChatSendData = {
  providerId: string;
  conversationId: string;
  message: string;
  mode?: string;
  model?: string;
  toggles?: Record<string, boolean>;
};

export type WsChatStreamData = {
  conversationId: string;
  chunk: string;
};

export type WsChatCompleteData = {
  conversationId: string;
  messageId: string;
};
