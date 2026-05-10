import type { AIProvider } from '@shared/types';
import { chatgptConfig } from './chatgpt';
import { claudeConfig } from './claude';
import { geminiConfig } from './gemini';
import { deepseekConfig } from './deepseek';
import { kimiConfig } from './kimi';
import { tongyiConfig } from './tongyi';
import { doubaoConfig } from './doubao';
import { glmConfig } from './glm';
import { longcatConfig } from './longcat';

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
  { id: 'kimi', name: 'Kimi', url: 'https://kimi.moonshot.cn', icon: '🌙', web_config: kimiConfig },
  { id: 'tongyi', name: '通义千问', url: 'https://tongyi.aliyun.com', icon: '🌐', web_config: tongyiConfig },
  { id: 'doubao', name: '豆包', url: 'https://www.doubao.com', icon: '🫘', web_config: doubaoConfig },
  { id: 'glm', name: 'GLM 智谱', url: 'https://chatglm.cn', icon: '💠', web_config: glmConfig },
  { id: 'longcat', name: 'LongCat', url: 'https://longcat.ai', icon: '🐱', web_config: longcatConfig },
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
