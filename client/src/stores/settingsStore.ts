import { create } from 'zustand';
import type { AppSettings } from '@shared/types';

interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    theme: 'system',
    accentColor: 'amber',
    sidebarCollapsed: false,
    sidebarWidth: 260,
    headless: false,
    embedding: {
      enabled: false,
      provider: 'local',
      apiUrl: 'http://localhost:11434/api',
      apiModel: 'nomic-embed-text',
    },
  },
  loading: false,
  error: null,

  loadSettings: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await window.api.settings.get();
      set({ settings });
    } catch (err) {
      console.error('加载设置失败:', err);
      set({ error: '加载设置失败' });
    } finally {
      set({ loading: false });
    }
  },

  updateSettings: async (partial) => {
    set({ error: null });
    try {
      await window.api.settings.set(partial);
      set((state) => ({ settings: { ...state.settings, ...partial } }));
    } catch (err) {
      console.error('更新设置失败:', err);
      set({ error: '更新设置失败' });
    }
  },

  clearError: () => set({ error: null }),
}));
