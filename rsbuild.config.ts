import path from 'node:path'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: { index: './src/main.tsx' },
  },
  html: {
    template: './index.html',
  },
  output: {
    distPath: { root: 'dist' },
  },
  server: {
    port: 5173,
    // Same-origin proxy: the panel API has no CORS middleware, so the browser
    // only ever talks to this dev server. Production uses the same shape behind
    // nginx (design D1).
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      // Semi 2.x 的 exports 字段未暴露 dist/css/*，这里直接指向实际文件以引入全量样式
      '@douyinfe/semi-ui/dist/css/semi.min.css': path.resolve(
        'node_modules/@douyinfe/semi-ui/dist/css/semi.min.css',
      ),
    },
  },
})
