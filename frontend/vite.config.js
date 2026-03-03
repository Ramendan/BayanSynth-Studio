import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8910',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Allow WASM files
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    exclude: ['rubberband-wasm'], // Don't pre-bundle WASM
  },
});
