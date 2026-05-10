import type { WebAutomationConfig } from '@shared/types';

export const doubaoConfig: WebAutomationConfig = {
  selectors: {
    input: 'textarea',
    sendButton: 'button[class*="send"]',
    responseContainer: '[class*="message"]',
    responseText: '[class*="content"]',
    stopButton: 'button[class*="stop"]',
    loginIndicator: 'button[class*="send"]',
    fallbackSelectors: {
      input: ['textarea', 'div[contenteditable="true"]'],
      sendButton: ['button[class*="send"]', 'button[aria-label*="Send"]'],
      responseContainer: ['[class*="message"]', '[class*="chat"]'],
    },
  },
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 5000,
    fallbackTimeoutMs: 120000,
  },
};
