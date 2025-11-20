import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    server: {
      // Proxy /api requests to a local server if you were running one (e.g. `vercel dev`)
      // This prevents CORS errors during local testing if the backend exists.
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    define: {
      // Expose API_KEY to the client securely, checking multiple common variable names
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || env.GOOGLE_API_KEY),
    },
  };
});