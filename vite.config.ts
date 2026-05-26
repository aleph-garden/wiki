import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [vue(), wasm(), topLevelAwait()],
  server: { port: 5173, host: '127.0.0.1' },
  optimizeDeps: { exclude: ['oxigraph'] },
  build: { target: 'esnext' },
});
