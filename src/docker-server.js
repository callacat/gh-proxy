// docker-server.js — 独立 HTTP 代理服务器（零外部依赖，仅 Node 内置模块）
import { createServer } from 'node:http';
import { extractGitHubUrl, proxyFetch, handlePreflight } from './proxy-core.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    const r = handlePreflight();
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.writeHead(204);
    res.end();
    return;
  }

  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // POST: read body, try JSON/plain/form
  let targetUrl = extractGitHubUrl(url.pathname);
  if (req.method === 'POST' && !targetUrl) {
    const body = await readBody(req);
    const ct = req.headers['content-type'] || '';
    let raw = null;
    if (ct.includes('json')) {
      try { const j = JSON.parse(body); raw = j.url || j.target; } catch {}
    } else if (ct.includes('form')) {
      try { raw = new URLSearchParams(body).get('url') || new URLSearchParams(body).get('target'); } catch {}
    } else {
      raw = body.trim();
    }
    if (raw) targetUrl = extractGitHubUrl(raw);
    if (!targetUrl) targetUrl = extractGitHubUrl(body.trim());
  }
  if (!targetUrl) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('用法: /https://github.com/user/repo/...\n  或: /github/user/repo/...');
    return;
  }

  const headers = new Headers();
  if (req.headers) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
  }

  try {
    const proxyRes = await proxyFetch(targetUrl, { headers }, { fetchFn: fetch });
    proxyRes.headers.forEach((v, k) => res.setHeader(k, v));
    res.writeHead(proxyRes.status);
    if (proxyRes.body) {
      const reader = proxyRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        res.write(value);
      }
    } else {
      res.end();
    }
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Proxy Error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`gh-proxy running on http://0.0.0.0:${PORT}`);
  console.log(`Try: http://localhost:${PORT}/https://github.com/user/repo/raw/main/README.md`);
});
