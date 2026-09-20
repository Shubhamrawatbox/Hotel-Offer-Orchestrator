import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * Every path the backend serves. The UI always calls them on its own origin and
 * the dev server forwards them, so the browser never makes a cross-origin
 * request and the API needs no CORS setup. nginx does the same job in Docker.
 */
const BACKEND_PATHS = ['/api', '/health', '/admin', '/supplierA', '/supplierB'];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const target = env.API_PROXY_TARGET || 'http://localhost:3000';

  const proxy: Record<string, ProxyOptions> = Object.fromEntries(
    BACKEND_PATHS.map((path) => [path, { target, changeOrigin: true }]),
  );

  return {
    root: rootDir,
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  };
});
