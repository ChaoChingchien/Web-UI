import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const SERVER_PORT = process.env.WEB_AI_PORT || '3001';
const CLIENT_PORT = parseInt(process.env.WEB_AI_CLIENT_PORT || '5199', 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: CLIENT_PORT,
    strictPort: false,
    proxy: {
      '/api': `http://localhost:${SERVER_PORT}`,
      '/ws': {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
});
