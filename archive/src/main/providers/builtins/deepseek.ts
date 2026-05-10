import type { WebAutomationConfig } from '@shared/types';

export const deepseekConfig: WebAutomationConfig = {
  selectors: {
    input: '#chat-input',
    sendButton: 'button[type="submit"]',
    responseContainer: '.ds-markdown',
    responseText: '.ds-markdown',
    stopButton: 'button[aria-label="Stop"]',
    loginIndicator: 'button[type="submit"]',
    fallbackSelectors: {
      input: ['#chat-input', 'textarea', 'div[contenteditable="true"]'],
      sendButton: ['button[type="submit"]', 'button:has(svg)'],
      responseContainer: ['.ds-markdown', '[class*="response"]'],
    },
  },
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 3000,
    fallbackTimeoutMs: 120000,
  },
};
