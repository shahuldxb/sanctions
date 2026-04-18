import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/scraper': { target: 'http://localhost:5002', changeOrigin: true, rewrite: (p) => p.replace(/^\/scraper/, '') },
      '/stream': { target: 'http://localhost:5002', changeOrigin: true }
    }
  }
})
