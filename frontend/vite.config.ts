import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,       // Listen on all addresses (0.0.0.0)
    port: 3000,       // Force port 3000
    strictPort: true, // Fail if port 3000 is occupied
    proxy: {
      '/v1': 'http://127.0.0.1:8000',
      '/mcp': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});