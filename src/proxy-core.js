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

// GitHub 原始域名列表（用于 302 重定向放行）
const GITHUB_DOMAINS = [
  'github.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'media.githubusercontent.com',
  'github-production-release-asset-2e65be.s3.amazonaws.com',
  'github-user-contributed-assets.s3.amazonaws.com',
];

/**
 * 检查域名是否在转发白名单
 * @param {string} url - 重定向 URL
 * @returns {boolean}
 */
export function isAllowedRedirect(url) {
  try {
    const host = new URL(url).hostname;
    return GITHUB_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
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
  // 透传或默认使用 gzip（节省 GitHub→代理带宽）
  if (!headers.has('accept-encoding')) {
    headers.set('accept-encoding', 'gzip, identity');
  }

  const ghResponse = await fetchFn(targetUrl, {
    redirect: 'manual',
    headers,
  });

  // 处理 302 重定向（GitHub releases / raw 经常会跳 CDN）
  if (ghResponse.status >= 300 && ghResponse.status < 400) {
    const location = ghResponse.headers.get('location');
    if (location && isAllowedRedirect(location)) {
      const finalResponse = await fetchFn(location, {
        redirect: 'follow',
        headers,
      });
      return buildResponse(finalResponse);
    }
    // 不允许的重定向 → 返回原始 302（浏览器自己处理外面的跳转）
    return buildResponse(ghResponse);
  }

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
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers':
        'Range, If-None-Match, If-Modified-Since',
      'access-control-max-age': '86400',
    },
  });
}
