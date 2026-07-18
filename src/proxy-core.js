// proxy-core.js — 核心代理逻辑，零外部依赖
// URL 映射：https://your.domain/https://github.com/user/repo/...

// ponytail: module-level constants, avoid per-call allocation
const FORWARD_HEADERS = [
  'user-agent', 'range', 'accept-encoding', 'accept',
  'if-none-match', 'if-modified-since',
];
const PASS_HEADERS = [
  'content-type', 'content-length', 'content-disposition',
  'cache-control', 'etag', 'last-modified', 'accept-ranges',
  'content-range', 'transfer-encoding',
];

/**
 * 从请求路径提取真实 GitHub URL
 * 支持格式：
 *   /https://github.com/user/repo/...
 *   /github/user/repo          → /github 前缀映射到 github.com
 *   /gh/user/repo              → /gh 前缀映射到 github.com
 * @param {string} rawPath
 * @returns {string|null}
 */
export function extractGitHubUrl(rawPath) {
  if (!rawPath) return null;

  // 优先匹配完整格式含 `github.com`
  const reFull = /github\.com\/[\w.%+-]+(?:[\w./@~:%+=-]*)?/i;
  let m = rawPath.match(reFull);
  if (m) return 'https://' + m[0];

  // 短格式：/github/ 或 /gh/ 前缀
  const reShort = /^\/(?:github|gh)\/([\w.%+-]+(?:[\w./@~:%+=-]*)?)\/?/i;
  m = rawPath.match(reShort);
  if (m) return 'https://github.com/' + m[1];

  return null;
}

/**
 * 执行代理 fetch
 * @param {string} targetUrl - 提取的 GitHub URL
 * @param {object} originalReq - 原始请求（用于透传 headers）
 * @param {object} [options]
 * @param {function} [options.fetchFn] - fetch 实现（平台可注入）
 * @returns {Promise<Response>}
 */
export async function proxyFetch(targetUrl, originalReq, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;

  const headers = new Headers();
  if (originalReq?.headers) {
    for (const h of FORWARD_HEADERS) {
      const val = originalReq.headers.get(h);
      if (val) headers.set(h, val);
    }
  }
  if (!headers.has('user-agent')) {
    headers.set('user-agent', 'Mozilla/5.0 (compatible; GhProxy/1.0)');
  }
  if (!headers.has('accept-encoding')) {
    headers.set('accept-encoding', 'gzip, identity');
  }

  // redirect: follow 自动处理多跳重定向链（github.com → CDN → S3）
  const ghResponse = await fetchFn(targetUrl, {
    redirect: 'follow',
    headers,
  });
  return buildResponse(ghResponse);
}

function buildResponse(ghResponse) {
  const headers = new Headers();

  for (const h of PASS_HEADERS) {
    const val = ghResponse.headers.get(h);
    if (val) headers.set(h, val);
  }

  // 透传 Content-Encoding（gzip 等压缩）
  const ce = ghResponse.headers.get('content-encoding');
  if (ce) headers.set('content-encoding', ce);

  // CORS
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-expose-headers',
    'content-length, content-range, accept-ranges');

  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'public, max-age=3600, s-maxage=3600');
  }

  return new Response(ghResponse.body, {
    status: ghResponse.status,
    statusText: ghResponse.statusText,
    headers,
  });
}

/**
 * 处理 OPTIONS 预检请求
 * @returns {Response}
 */
export function handlePreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
      'access-control-allow-headers':
        'Range, If-None-Match, If-Modified-Since, Content-Type',
      'access-control-max-age': '86400',
    },
  });
}

/** 从 POST body 提取 GitHub URL */
export async function extractUrlFromPost(request) {
  const ct = request.headers?.get?.('content-type') || '';
  if (ct.includes('application/json')) {
    const body = typeof request.json === 'function' ? await request.json() : request.body;
    return body?.url || body?.target || null;
  }
  if (ct.includes('text/plain')) {
    const text = typeof request.text === 'function' ? await request.text() : request.body;
    return (text || '').trim() || null;
  }
  if (ct.includes('multipart') || ct.includes('form-urlencoded')) {
    const form = typeof request.formData === 'function' ? await request.formData().catch(() => null) : null;
    if (form) return form.get('url') || form.get('target') || null;
  }
  return null;
}
