// web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // HMR explicite (évite les surprises quand le host change)
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
    },
    // Proxy SEULEMENT ce dont on a besoin
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '^/(auth|rooms|img|health)': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // ⚠️ Ne surtout pas proxifier "/" en entier (ça casse le HMR)
    },
  },
})
