import type { AIProvider } from '@shared/types';
import { chatgptConfig } from './chatgpt';
import { claudeConfig } from './claude';
import { geminiConfig } from './gemini';
import { deepseekConfig } from './deepseek';

interface BuiltinDefinition {
  id: string;
  name: string;
  url: string;
  icon: string;
  web_config: AIProvider['web_config'];
}

const builtins: BuiltinDefinition[] = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖', web_config: chatgptConfig },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', icon: '🧠', web_config: claudeConfig },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', icon: '✨', web_config: geminiConfig },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: '🔍', web_config: deepseekConfig },
];

export function createBuiltinProviders(): AIProvider[] {
  const now = new Date().toISOString();
  return builtins.map((b) => ({
    id: b.id,
    name: b.name,
    type: 'web' as const,
    icon: b.icon,
    url: b.url,
    web_config: b.web_config,
    is_custom: false,
    is_enabled: true,
    created_at: now,
    updated_at: now,
  }));
}
