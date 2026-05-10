import type { WebAutomationConfig } from '@shared/types';

export const deepseekConfig: WebAutomationConfig = {
  selectors: {
    input: 'textarea#chat-input, textarea',
    sendButton: 'button[type="submit"]',
    responseContainer: '.ds-markdown, [class*="ds-chat-message"], [class*="message-content"], main',
    responseText: '.ds-markdown, [class*="ds-chat-message"], [class*="message-content"]',
    stopButton: 'button[aria-label="Stop"]',
    loginIndicator: 'button[type="submit"]',
    fallbackSelectors: {
      input: ['textarea#chat-input', 'textarea', 'div[contenteditable="true"]'],
      sendButton: ['button[type="submit"]', 'button:has(svg)', '[class*="send"]'],
      responseContainer: ['.ds-markdown', '[class*="ds-chat-message"]', '[class*="message-content"]', 'main'],
    },
  },
  // DeepSeek 模式选择（快速模式 / 专家模式 / 识图模式，模式已对应模型）
  modeSelector: {
    container: '[class*="mode"], [class*="tab"], [role="tablist"]',
    buttons: [
      { name: '快速模式', selector: 'button:has-text("快速"), div:has-text("快速模式")' },
      { name: '专家模式', selector: 'button:has-text("专家"), div:has-text("专家模式")' },
      { name: '识图模式', selector: 'button:has-text("识图"), div:has-text("识图模式")' },
    ],
    defaultMode: '快速模式',
  },
  // DeepSeek 底部开关（深度思考、联网搜索），以 div 形式渲染
  toggles: [
    {
      label: '深度思考',
      selector: 'div[class*="toggle-button"]:has-text("深度"), div[class*="toggle"]:has-text("深度")',
      defaultOn: false,
    },
    {
      label: '联网搜索',
      selector: 'div[class*="toggle-button"]:has-text("搜索"), div[class*="toggle"]:has-text("搜索")',
      defaultOn: false,
    },
  ],
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 4000,
    fallbackTimeoutMs: 120000,
  },
};
