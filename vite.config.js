import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  // dev 下 /api 的转发目标。
  //
  // 不配代理时，Vite 的 SPA fallback 会把 /api/problems 也回成 index.html
  // （HTTP 200 + text/html），前端 res.ok 判断过得去，却在 res.json() 上炸成
  // "Unexpected token '<'"，看起来像前端 bug，实际是没有后端。
  //
  // 默认指向本地后端；想直接用线上已存的题目，起服务时覆盖：
  //   VITE_API_PROXY=https://go.xlingdata.com npm run dev
  // ⚠️ 指向线上时，本地「保存 / 删除题目」会真的写生产库。
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:8000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
