import { ProviderModel, ConversationModel, MessageModel } from '../database/models';
import { AIRouter } from '../ai/AIRouter';

const aiRouter = new AIRouter();

export async function executeChat(
  providerId: string,
  conversationId: string,
  message: string,
  options?: { mode?: string; model?: string; toggles?: Record<string, boolean> },
  callbacks?: {
    onChunk?: (chunk: string) => void;
    onDone?: (messageId: string) => void;
    onError?: (error: string, partialContent?: string) => void;
  }
): Promise<void> {
  const provider = ProviderModel.findById(providerId);
  if (!provider) throw new Error('AI 提供商不存在');

  let conversation = ConversationModel.findById(conversationId);
  if (!conversation) {
    conversation = ConversationModel.create(providerId, message.substring(0, 50) || '新对话');
    conversationId = conversation.id;
  }

  MessageModel.create(conversationId, 'user', message);

  const history = MessageModel.findByConversation(conversationId);
  const messages = history.map((m) => ({
    role: m.role as 'system' | 'user' | 'assistant',
    content: m.content,
  }));

  let fullResponse = '';
  const knownWebUrl = conversation.web_url;

  await aiRouter.chatStream(
    provider,
    messages,
    { ...options, conversationId, webUrl: knownWebUrl },
    (chunk) => {
      fullResponse += chunk;
      callbacks?.onChunk?.(chunk);
    },
    (meta) => {
      const savedMessage = MessageModel.create(conversationId, 'assistant', fullResponse);
      ConversationModel.touch(conversationId);
      if (meta?.finalUrl && provider.type === 'web' && meta.finalUrl !== knownWebUrl) {
        ConversationModel.updateWebUrl(conversationId, meta.finalUrl);
      }
      if (message) {
        const conv = ConversationModel.findById(conversationId);
        if (conv && conv.title === '新对话') {
          const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
          ConversationModel.updateTitle(conversationId, title);
        }
      }
      callbacks?.onDone?.(savedMessage.id);
    },
    (err) => {
      if (fullResponse) {
        MessageModel.create(conversationId, 'assistant', fullResponse);
        ConversationModel.touch(conversationId);
      }
      callbacks?.onError?.(err.message, fullResponse || undefined);
    }
  );
}
