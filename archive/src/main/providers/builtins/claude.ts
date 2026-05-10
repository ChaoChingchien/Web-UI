import type { WebAutomationConfig } from '@shared/types';

export const claudeConfig: WebAutomationConfig = {
  selectors: {
    input: 'div[contenteditable="true"][data-placeholder]',
    sendButton: 'button[aria-label="Send Message"]',
    responseContainer: '.font-claude-message',
    responseText: '.font-claude-message',
    stopButton: 'button[aria-label="Stop"]',
    loginIndicator: 'button[aria-label="Send Message"]',
    fallbackSelectors: {
      input: ['div[contenteditable="true"]', 'textarea'],
      sendButton: ['button[aria-label="Send Message"]', 'button:has(svg)'],
      responseContainer: ['.font-claude-message', '[class*="assistant"]'],
    },
  },
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 5000,
    fallbackTimeoutMs: 120000,
  },
};
