import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.CRM_API_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`;
const devPort = Number(process.env.LOCAL_CRM_UI_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
    },
  },
});
