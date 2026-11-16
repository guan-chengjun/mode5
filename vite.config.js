import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    open: true,
    // 允许从任意在线地址加载 GLB 资源（模型服务器仍需返回 CORS 头）
    cors: true
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
})
