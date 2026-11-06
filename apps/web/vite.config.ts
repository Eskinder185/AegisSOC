/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev server binds to loopback only and proxies /api to the local Spring Boot API (same-origin => SameSite=Strict cookies work).
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/AegisSOC/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false } },
  },
  preview: { host: '127.0.0.1', port: 5180 },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
