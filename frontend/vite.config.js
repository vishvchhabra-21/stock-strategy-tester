import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: globalThis.process?.env?.VITE_API_PROXY_TARGET || 'http://localhost:5002',
        changeOrigin: true
      }
    }
  }
});
