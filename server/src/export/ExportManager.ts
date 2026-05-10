import type { Message, Conversation } from '@shared/types';

export class ExportManager {
  static markdown(conversation: Conversation, messages: Message[]): string {
    let md = `# ${conversation.title}\n\n`;
    md += `> AI: ${conversation.provider_id}\n`;
    md += `> 时间: ${conversation.created_at}\n\n---\n\n`;

    for (const msg of messages) {
      const role = msg.role === 'user' ? '👤 用户' : '🤖 AI';
      md += `### ${role} *(${msg.created_at})*\n\n${msg.content}\n\n---\n\n`;
    }

    return md;
  }

  static text(conversation: Conversation, messages: Message[]): string {
    let txt = `${conversation.title}\n${'='.repeat(40)}\n\n`;

    for (const msg of messages) {
      const role = msg.role === 'user' ? '用户' : 'AI';
      txt += `[${msg.created_at}] ${role}:\n${msg.content}\n\n`;
    }

    return txt;
  }

  static json(conversation: Conversation, messages: Message[]): string {
    return JSON.stringify(
      {
        conversation,
        messages,
        exported_at: new Date().toISOString(),
      },
      null,
      2
    );
  }
}
