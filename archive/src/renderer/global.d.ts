import type { WindowApi } from '../preload/index';

declare global {
  interface Window {
    api: WindowApi;
  }
}
