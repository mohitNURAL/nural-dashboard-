import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const api = 'http://localhost:4000';

// Each build gets an ID, compiled into the app and written to /version.json. An open dashboard
// compares the two to tell people a new version was deployed (hooks/useNewVersion.ts).
const BUILD_ID = new Date().toISOString();
const versionFile: Plugin = {
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ build: BUILD_ID }),
    });
  },
};

export default defineConfig({
  plugins: [react(), versionFile],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
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
