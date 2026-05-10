import type { WebAutomationConfig } from '@shared/types';

export const geminiConfig: WebAutomationConfig = {
  selectors: {
    input: 'div[contenteditable="true"][role="textbox"]',
    sendButton: 'button[aria-label="Send"]',
    responseContainer: '.model-response-text',
    responseText: '.model-response-text',
    stopButton: 'button[aria-label="Stop generating"]',
    loginIndicator: 'button[aria-label="Send"]',
    fallbackSelectors: {
      input: ['div[contenteditable="true"]', 'textarea'],
      sendButton: ['button[aria-label="Send"]', 'button:has(mat-icon)'],
      responseContainer: ['.model-response-text', '[class*="response"]'],
    },
  },
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 5000,
    fallbackTimeoutMs: 120000,
  },
};
