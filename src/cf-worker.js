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
  const m = rawPath.match(/(?:raw\.githubusercontent|gist\.githubusercontent|gist\.github|github)\.com\/[\w.%+-]+(?:[\w./@~:%+=-]*)?/i);
  if (m) {
    // gist.github.com 在很多环境解析不稳定，统一转写为 gist.githubusercontent.com
    const host = m[0].split('/')[0];
    if (host === 'gist.github.com') m[0] = m[0].replace('gist.github.com', 'gist.githubusercontent.com');
    return 'https://' + m[0];
  }
  const n = rawPath.match(/^\/(?:github|gh)\/([\w.%+-]+(?:[\w./@~:%+=-]*)?)\/?/i);
  return n ? 'https://github.com/' + n[1] : null;
}

async function proxyFetch(targetUrl, request, ctx) {
  const headers = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = request?.headers?.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0 (compatible; GhProxy/1.0)');
  if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'gzip, identity');

  // 边缘缓存：命中直接返回，避免穿透到 GitHub
  const cacheKey = new Request(targetUrl);
  const cached = await caches.default.match(cacheKey);
  if (cached) return buildResponse(cached);

  const response = await fetch(targetUrl, { redirect: 'follow', headers });

  // 小文件（<100MB）写入边缘缓存，大文件跳过避免 OOM
  const cl = response.headers.get('content-length');
  if (response.ok && ctx && cl && parseInt(cl, 10) < 100_000_000) {
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  }

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

/** POST body → GitHub URL */
async function extractUrlFromPost(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = await request.json();
    return body?.url || body?.target || null;
  }
  if (ct.includes('text/plain')) {
    return (await request.text()).trim() || null;
  }
  const form = await request.formData().catch(() => null);
  if (form) return form.get('url') || form.get('target') || null;
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
      'access-control-allow-headers': 'Range, If-None-Match, If-Modified-Since, Content-Type',
      'access-control-max-age': '86400',
    }});
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let target = request.method === 'POST'
      ? await extractUrlFromPost(request) || extractGitHubUrl(url.pathname)
      : extractGitHubUrl(url.pathname);
    if (!target) return new Response(
      '用法: /https://github.com/user/repo/...\n  或: /github/user/repo/...\n  或: /gh/user/repo/...',
      { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
    if (/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(target)) {
      return Response.redirect(target + '/archive/refs/heads/main.zip', 302);
    }
    return proxyFetch(target, request, ctx);
  },
};
