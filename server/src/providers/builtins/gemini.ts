import type { WebAutomationConfig } from '@shared/types';

export const geminiConfig: WebAutomationConfig = {
  selectors: {
    input: 'div[contenteditable="true"][role="textbox"]',
    sendButton: 'button[aria-label*="Send"]',
    responseContainer: '.model-response-text',
    responseText: '.model-response-text',
    stopButton: 'button[aria-label*="Stop"]',
    loginIndicator: 'button[aria-label*="Send"]',
    fallbackSelectors: {
      input: ['div[contenteditable="true"]', 'textarea'],
      sendButton: ['button[aria-label*="Send"]', 'button:has(mat-icon)'],
      responseContainer: ['.model-response-text', '[class*="response"]'],
    },
  },
  // Gemini 模式切换（快速 / PRO — 页面上的标签页按钮）
  modeSelector: {
    container: '[class*="pillbox"], [class*="tab"]',
    buttons: [
      { name: '快速', selector: 'button:has-text("快速")' },
      { name: 'PRO', selector: 'button:has-text("PRO")' },
    ],
    defaultMode: '快速',
  },
  waitStrategy: 'noNewText',
  waitOptions: {
    pollingIntervalMs: 500,
    noNewTextTimeoutMs: 5000,
    fallbackTimeoutMs: 120000,
  },
};
