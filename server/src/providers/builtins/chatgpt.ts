import type { WebAutomationConfig } from '@shared/types';

export const chatgptConfig: WebAutomationConfig = {
  selectors: {
    input: '#prompt-textarea',
    sendButton: '[data-testid="send-button"]',
    responseContainer: '[data-message-author-role="assistant"]',
    responseText: '.markdown',
    stopButton: '[data-testid="stop-button"]',
    loginIndicator: '[data-testid="send-button"]',
    fallbackSelectors: {
      input: ['#prompt-textarea', 'textarea[data-id]', 'div[contenteditable="true"]'],
      sendButton: ['[data-testid="send-button"]', 'button[aria-label*="Send"]'],
      responseContainer: ['[data-message-author-role="assistant"]', '.assistant-message'],
    },
  },
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 3000,
    fallbackTimeoutMs: 120000,
  },
};
