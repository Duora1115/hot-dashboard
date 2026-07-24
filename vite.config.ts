import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'frontend/dist',
    emptyOutDir: true,
    target: 'es2020',
    // esbuild minifier is much faster than terser and produces near-identical output.
    minify: 'esbuild',
    cssMinify: 'esbuild',
    // Keep source maps off in production to reduce transferred bytes.
    sourcemap: false,
    // Bump the warning threshold so we only see genuine problems.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavyweight libs into their own chunks so each page's route
        // chunk stays small, and vendor code can be cached independently of
        // app updates.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
            return 'vendor-recharts'
          }
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('react-router') || id.includes('@remix-run')) return 'vendor-router'
          if (id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react-dom'
          if (id.includes('/react/')) return 'vendor-react'
          if (id.includes('zustand')) return 'vendor-state'
          return 'vendor'
        },
      },
    },
  },
  esbuild: {
    // Drop debug logs in production; keep console.warn / .error for real issues.
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    pure: ['console.debug', 'console.log'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
