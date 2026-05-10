import type { WindowApi } from './api-client';

declare global {
  interface Window {
    api: WindowApi;
  }
}
