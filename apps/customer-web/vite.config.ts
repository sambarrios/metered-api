import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev we proxy the API so the SPA can use same-origin relative paths
// (/v1/...). For another deployment, set VITE_API_URL and the client falls
// back to calling it directly (the API has CORS enabled).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
