// cf-worker.js — Cloudflare Worker 单文件版（CLI + Dashboard 均可用）
const FORWARD_HEADERS = [
  'user-agent', 'range', 'accept-encoding', 'accept',
  'if-none-match', 'if-modified-since',
];
const PASS_HEADERS = [
  'content-type', 'content-length', 'content-disposition',
  'cache-control', 'etag', 'last-modified', 'accept-ranges',
  'content-range', 'transfer-encoding',
];

function extractGitHubUrl(rawPath) {
  if (!rawPath) return null;
  const m = rawPath.match(/github\.com\/[\w.%+-]+(?:[\w./@~:%+=-]*)?/i);
  if (m) return 'https://' + m[0];
  const n = rawPath.match(/^\/(?:github|gh)\/([\w.%+-]+(?:[\w./@~:%+=-]*)?)\/?/i);
  return n ? 'https://github.com/' + n[1] : null;
}

async function proxyFetch(targetUrl, request) {
  const headers = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = request?.headers?.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0 (compatible; GhProxy/1.0)');
  if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'gzip, identity');

  // Follow the full redirect chain (Releases → CDN → S3 can be multi-hop)
  let response = await fetch(targetUrl, { redirect: 'follow', headers });
  return buildResponse(response);
}

function buildResponse(ghRes) {
  const headers = new Headers();
  for (const h of PASS_HEADERS) {
    const v = ghRes.headers.get(h);
    if (v) headers.set(h, v);
  }
  const ce = ghRes.headers.get('content-encoding');
  if (ce) headers.set('content-encoding', ce);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-expose-headers', 'content-length, content-range, accept-ranges');
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=3600, s-maxage=3600');
  return new Response(ghRes.body, {
    status: ghRes.status,
    statusText: ghRes.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'Range, If-None-Match, If-Modified-Since',
      'access-control-max-age': '86400',
    }});
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const target = extractGitHubUrl(url.pathname);
    if (!target) return new Response(
      '用法: /https://github.com/user/repo/...\n  或: /github/user/repo/...\n  或: /gh/user/repo/...',
      { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
    // 裸仓库路径 → 302 到 zipball
    if (/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(target)) {
      return Response.redirect(target + '/archive/refs/heads/main.zip', 302);
    }
    return proxyFetch(target, request);
  },
};
