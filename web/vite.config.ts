import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5179,
    // The orchestrator runs in the API process; SSE must not be buffered.
    proxy: {
      '/api': { target: 'http://localhost:5178', changeOrigin: true },
    },
  },
});
