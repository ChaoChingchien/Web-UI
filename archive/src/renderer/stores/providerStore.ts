import { create } from 'zustand';
import type { AIProvider } from '@shared/types';

interface ProviderState {
  providers: AIProvider[];
  activeProviderId: string | null;
  loading: boolean;

  // Actions
  loadProviders: () => Promise<void>;
  setActiveProvider: (id: string | null) => void;
  addProvider: (provider: Omit<AIProvider, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  activeProviderId: null,
  loading: false,

  loadProviders: async () => {
    set({ loading: true });
    try {
      const providers = await window.api.provider.list();
      set({ providers });
    } finally {
      set({ loading: false });
    }
  },

  setActiveProvider: (id) => set({ activeProviderId: id }),

  addProvider: async (provider) => {
    await window.api.provider.add(provider);
    await get().loadProviders();
  },

  deleteProvider: async (id) => {
    await window.api.provider.delete(id);
    await get().loadProviders();
  },
}));
