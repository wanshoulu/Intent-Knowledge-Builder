import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import commonjs from '@rollup/plugin-commonjs';
import path from 'node:path';

// 前端通过同源代理访问主服务的 /api/xiaoi/*（开发模式）；
// 生产构建后由主服务静态托管 dist/，API 同源直连。
// commonjs 插件仅作用于仓库内 packages/xiaoi-core（CommonJS，与 Node 运行时同源复用）：
// 不限 include 会连 node_modules 一起转换，破坏 antd/react 的 ESM 解析。
export default defineConfig({
  // 部署路径：主服务把 dist 托管在 /tools/xiaoi-workbench/dist/ 下
  base: '/tools/xiaoi-workbench/dist/',
  plugins: [
    react(),
    // 仅构建期需要：Rollup 命名导入 CJS 的转换。
    // vitest 原生支持 CJS interop，且该插件的 require 重写在 vitest 环境不兼容
    // ——故用 apply: 'build' 只在 build 生效。
    {
      ...commonjs({ include: [/xiaoi-core/], extensions: ['.js'] }),
      apply: 'build',
    },
  ],
  resolve: {
    // 显式别名，统一前端对 core 的引用方式
    alias: {
      '@xiaoi-core': path.resolve(__dirname, '../../packages/xiaoi-core/index.js'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3200',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // jsdom 下 antd Menu 点击 → 路由切换 → 页面挂载链路较慢，默认 5s 会超时
    testTimeout: 20000,
  },
});
