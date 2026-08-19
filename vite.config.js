import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ai-assets': 'http://127.0.0.1:8787',
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        decoder: fileURLToPath(new URL('./converter-frame.html', import.meta.url)),
      },
    },
  },
})
