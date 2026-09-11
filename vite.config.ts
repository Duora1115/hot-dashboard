import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // 必须是绝对根路径：'./' 会让 index.html 引用 ./assets/x.js，而浏览器在
  // /kol/oc_xxx、/stock/301308 这类两段以上路径下会把它解析成
  // /kol/assets/x.js → 404 → 入口脚本加载失败 → 白屏。站点本就挂在域名根下
  // （API 也一律用 /api/... 绝对路径），根路径与之一致。
  base: '/',
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
          // force-graph 只被 /chain 动态引入，单独分包，别落进主包 vendor
          if (
            id.includes('force-graph') ||
            id.includes('kapsule') ||
            id.includes('d3-force-3d') ||
            id.includes('d3-binarytree') ||
            id.includes('d3-octree') ||
            id.includes('canvas-color-tracker') ||
            id.includes('float-tooltip') ||
            id.includes('accessor-fn') ||
            id.includes('index-array-by') ||
            id.includes('bezier-js') ||
            id.includes('@tweenjs')
          ) {
            return 'vendor-force-graph'
          }
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
