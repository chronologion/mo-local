import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // LiveStore bundles wa-sqlite; pre-bundling it breaks wasm loading in dev.
    exclude: ['@livestore/wa-sqlite'],
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
});
