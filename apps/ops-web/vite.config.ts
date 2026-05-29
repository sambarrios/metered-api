import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy so the SPA can use same-origin relative /ops paths. Set
// VITE_API_URL to point at the API directly (CORS is enabled) for other
// deployments. A distinct port from customer-web keeps the two consoles
// running side by side.
//
// VITE_PROXY_TARGET overrides where the dev proxy forwards: defaults to the
// host API on localhost, set to http://api:3000 when running in Docker Compose.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/ops': { target: proxyTarget, changeOrigin: true },
    },
  },
});
