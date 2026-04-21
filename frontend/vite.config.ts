import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Stable content-hash filenames — chunk names derived from module path
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Pin heavy vendor libs into stable shared chunks
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react'
            if (id.includes('lucide')) return 'vendor-icons'
            if (id.includes('@tanstack') || id.includes('trpc') || id.includes('superjson')) return 'vendor-trpc'
            return 'vendor'
          }
        },
      },
    },
    // Emit manifest.json so the server can map logical names to hashed filenames
    manifest: true,
    chunkSizeWarningLimit: 1000,
  },
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
