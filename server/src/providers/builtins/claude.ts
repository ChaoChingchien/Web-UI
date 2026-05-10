import type { WebAutomationConfig } from '@shared/types';

export const claudeConfig: WebAutomationConfig = {
  selectors: {
    input: 'div[contenteditable="true"]',
    sendButton: 'button[aria-label="Send Message"]',
    responseContainer: '[class*="font-claude"], main',
    responseText: '[class*="font-claude"], [class*="message"]',
    stopButton: 'button[aria-label="Stop"]',
    loginIndicator: 'button[aria-label="Send Message"]',
    fallbackSelectors: {
      input: ['div[contenteditable="true"]', 'textarea'],
      sendButton: ['button[aria-label="Send Message"]', 'button[aria-label*="Send"]'],
      responseContainer: ['[class*="font-claude"]', '[class*="message"]', 'main'],
    },
  },
  // Claude 新版启动页无输入框，需要先导航到新对话页面，并选择对话风格
  conversationStart: {
    url: 'https://claude.ai/new',
    starterStyle: 'button:has-text("Claude’s choice")',
    waitAfterMs: 4000,
  },
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 5000,
    fallbackTimeoutMs: 120000,
  },
};
