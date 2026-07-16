import { extractGitHubUrl, proxyFetch, handlePreflight } from '../src/proxy-core.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
    const r = handlePreflight();
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).setHeader('content-type', 'text/plain').end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const targetUrl = extractGitHubUrl(url.pathname);
  if (!targetUrl) {
    res.status(400).setHeader('content-type', 'text/plain; charset=utf-8')
      .end('用法: /https://github.com/user/repo/...\n  或: /github/user/repo/...');
    return;
  }

  const fakeReq = { headers: new Headers() };
  if (req.headers) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) fakeReq.headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
  }

  const proxyRes = await proxyFetch(targetUrl, fakeReq);
  proxyRes.headers.forEach((v, k) => res.setHeader(k, v));
  res.statusCode = proxyRes.status;
  if (proxyRes.body) {
    const reader = proxyRes.body.getReader();
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { res.end(); return; }
      res.write(value);
      return pump();
    });
    await pump();
  } else {
    res.end();
  }
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Proxy Error: ${err.message}`);
  }
}
