import { create } from 'zustand';
import type { AppSettings } from '@shared/types';

interface SettingsState {
  settings: AppSettings;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    theme: 'system',
    sidebarCollapsed: false,
    sidebarWidth: 260,
  },

  loadSettings: async () => {
    const settings = await window.api.settings.get();
    set({ settings });
  },

  updateSettings: async (partial) => {
    await window.api.settings.set(partial);
    set((state) => ({ settings: { ...state.settings, ...partial } }));
  },
}));
