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
  build: {
    rollupOptions: {
      output: {
        // ECharts is most of the bundle and changes rarely; cache it apart from app code.
        manualChunks: (id) =>
          /[\\/]node_modules[\\/](echarts|zrender)[\\/]/.test(id) ? 'echarts' : undefined,
      },
    },
  },
});
