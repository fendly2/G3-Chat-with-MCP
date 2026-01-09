import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,       // Listen on all addresses (0.0.0.0), fixes localhost issues
    port: 3000,       // Force port 3000
    strictPort: true, // If 3000 is busy, fail instead of switching to 5173
    // Development Proxy: Forwards requests to Python Backend
    proxy: {
      '/v1': 'http://127.0.0.1:8000', // Use explicit IP instead of localhost
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