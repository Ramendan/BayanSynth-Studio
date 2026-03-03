import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so index.html works via file:// in packaged Electron
  base: './',
  server: {
    port: 5177,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8910',
        changeOrigin: true,
      },
      '/voices': {
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
