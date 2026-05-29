import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev we proxy the API so the SPA can use same-origin relative paths
// (/v1/...). For another deployment, set VITE_API_URL and the client falls
// back to calling it directly (the API has CORS enabled).
//
// VITE_PROXY_TARGET overrides where the dev proxy forwards: defaults to the
// host API on localhost, set to http://api:3000 when running in Docker Compose.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: proxyTarget, changeOrigin: true },
    },
  },
});
