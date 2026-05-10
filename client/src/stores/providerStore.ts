import { create } from 'zustand';
import type { AIProvider } from '@shared/types';

interface ProviderState {
  providers: AIProvider[];
  activeProviderId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  loadProviders: () => Promise<void>;
  setActiveProvider: (id: string | null) => void;
  addProvider: (provider: Omit<AIProvider, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  activeProviderId: null,
  loading: false,
  error: null,

  loadProviders: async () => {
    set({ loading: true, error: null });
    try {
      const providers = await window.api.provider.list();
      set({ providers });
    } catch (err) {
      console.error('加载提供商失败:', err);
      set({ providers: [], error: '加载提供商列表失败' });
    } finally {
      set({ loading: false });
    }
  },

  setActiveProvider: (id) => set({ activeProviderId: id }),

  addProvider: async (provider) => {
    set({ error: null });
    try {
      await window.api.provider.add(provider);
      await get().loadProviders();
    } catch (err) {
      console.error('添加提供商失败:', err);
      set({ error: '添加提供商失败' });
    }
  },

  deleteProvider: async (id) => {
    set({ error: null });
    try {
      await window.api.provider.delete(id);
      await get().loadProviders();
    } catch (err) {
      console.error('删除提供商失败:', err);
      set({ error: '删除提供商失败' });
    }
  },

  clearError: () => set({ error: null }),
}));
