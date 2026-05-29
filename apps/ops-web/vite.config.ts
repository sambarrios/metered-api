import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy so the SPA can use same-origin relative /ops paths. Set
// VITE_API_URL to point at the API directly (CORS is enabled) for other
// deployments. A distinct port from customer-web keeps the two consoles
// running side by side.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/ops': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
