'use strict';
/**
 * Intent-Knowledge-Builder — 小 i 知识工作台（独立版）
 *
 * 从 AI Harbor 分割出的独立服务：知识点 / 语言规则 / 业务概念模型 /
 * 交互编排 / 治理发布与反馈质检的一体化工作台。
 *
 * 启动：
 *   npm install          # 0 个 npm 依赖（纯 Node 内置模块）
 *   npm start            # http://127.0.0.1:3200
 *   PORT=8080 npm start
 *
 * 前端（tools/xiaoi-workbench/dist）已预构建；从源码重建见
 * tools/xiaoi-workbench/package.json（React + antd + Vite）。
 *
 * 可选小 i 运行时（意图识别试算）：
 *   cd services/xiaoi-runtime && npm install && npm start   # → http://127.0.0.1:3100
 *   XIAOI_RUNTIME_URL=http://127.0.0.1:3100 npm start       # 主服务转发 /api/xiaoi/runtime/*
 *
 * 环境变量（均可选，见 .env.example）：
 *   HOST / PORT          服务监听
 *   QWEN_KEY / DEEPSEEK_KEY 等   云 LLM 密钥（AI 辅助生成 DSL/正则/测试用例）
 *   XIAOI_RUNTIME_URL    小 i 运行时地址（默认 http://127.0.0.1:17387）
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3200);
const HOST = process.env.HOST || '127.0.0.1';

const { handleXiaoiAiAssist } = require('./routes/xiaoi-ai-assist');
const { handleXiaoiRuntimeProxy } = require('./routes/xiaoi-runtime-proxy');

// ── 极简静态文件服务（tools/ 白名单）──
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const WORKBENCH_PREFIX = '/tools/xiaoi-workbench';
function serveStatic(req, res) {
  const u = new URL(req.url, 'http://localhost');
  let p = path.normalize(u.pathname).replace(/^([/\\])+/, '');
  // 根路径 302 到工作台（不用 readFile 直出：页面内资源按浏览器地址解析相对路径，
  // URL 停留在 / 时 dist 内资源会解析错位 → 404）
  if (p === '' || p === '.') {
    res.writeHead(302, { Location: WORKBENCH_PREFIX + '/dist/index.html' });
    return res.end();
  }
  // 静态文件只允许工作台 dist 内（白名单）：.env（密钥）、src 源码、
  // node_modules、数据与运行时源码一律不可经 HTTP 读取。
  const rel = path.relative(path.join(__dirname, 'tools', 'xiaoi-workbench', 'dist'),
    path.join(__dirname, p));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403); return res.end('forbidden');
  }
  const file = path.join(__dirname, p);
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404: ' + p); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  try {
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (pathname === '/healthz' || pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, service: 'intent-knowledge-builder', time: Date.now() }));
    }
    // 小 i AI 辅助（DSL/正则/测试用例生成审查，云 LLM 经 config/api-keys 路由）
    if (handleXiaoiAiAssist(req, res)) return;
    // 小 i 运行时代理（转发到 XIAOI_RUNTIME_URL，意图识别试算）
    if (handleXiaoiRuntimeProxy(req, res)) return;
    return serveStatic(req, res);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
    }
  }
});

server.listen(PORT, HOST, function () {
  console.log('[intent-knowledge-builder] http://' + HOST + ':' + PORT + '/  （Ctrl+C 退出）');
});
