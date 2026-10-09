import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  // Only VITE_* variables reach the browser; Bitrix24 secrets stay in apps/api.
  envPrefix: 'VITE_',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': api,
      '/health': api,
    },
  },
});
