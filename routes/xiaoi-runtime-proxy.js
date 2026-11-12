const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');

const PUBLIC_PREFIX = '/api/xiaoi/runtime';

function handleXiaoiRuntimeProxy(request, response, options = {}) {
  const pathname = request.pathname ||
    new URL(request.url, 'http://ai-harbor').pathname;
  if (pathname !== PUBLIC_PREFIX && !pathname.startsWith(`${PUBLIC_PREFIX}/`)) {
    return false;
  }

  const target = new URL(
    options.target ||
    process.env.XIAOI_RUNTIME_URL ||
    'http://127.0.0.1:3100'
  );
  const originalUrl = new URL(request.url, 'http://ai-harbor');
  const suffix = pathname.slice(PUBLIC_PREFIX.length);
  const upstreamPath = `/api/v1${suffix}${originalUrl.search}`;
  const transport = target.protocol === 'https:' ? https : http;
  const requestId = request.headers['x-request-id'] || crypto.randomUUID();
  const headers = {
    ...request.headers,
    host: target.host,
    'x-request-id': requestId
  };
  delete headers['content-length'];

  const upstream = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: request.method,
    path: upstreamPath,
    headers
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      ...upstreamResponse.headers,
      'x-request-id': requestId
    });
    upstreamResponse.pipe(response);
  });

  upstream.on('error', () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const payload = JSON.stringify({
      data: null,
      meta: { request_id: requestId, version: 'v1' },
      error: {
        code: 'XIAOI_RUNTIME_UNAVAILABLE',
        message: '小 i 运行时服务暂不可用',
        details: {}
      }
    });
    response.writeHead(502, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'x-request-id': requestId
    });
    response.end(payload);
  });

  request.pipe(upstream);
  return true;
}

module.exports = {
  handleXiaoiRuntimeProxy
};
