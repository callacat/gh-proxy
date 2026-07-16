import { extractGitHubUrl, proxyFetch, handlePreflight } from '../../src/proxy-core.js';

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      const r = handlePreflight();
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      return { statusCode: 204, headers };
    }
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const targetUrl = extractGitHubUrl(event.path);
    if (!targetUrl) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: '用法: /https://github.com/user/repo/...\n  或: /github/user/repo/...',
      };
    }

    const proxyRes = await proxyFetch(targetUrl, null);
    const headers = {};
    proxyRes.headers.forEach((v, k) => { headers[k] = v; });

    // Netlify free tier: 10MB response limit, 1024MB RAM.
    // ArrayBuffer preserves binary content; streaming is not available here.
    const contentLen = proxyRes.headers.get('content-length');
    if (contentLen && parseInt(contentLen, 10) > 10_000_000) {
      return {
        statusCode: 413,
        headers: { 'content-type': 'text/plain' },
        body: `File too large: ${contentLen} bytes. Netlify free tier max is ~10MB. Use Docker/Vercel/CF Workers instead.`,
      };
    }

    const arrayBuffer = proxyRes.body ? await proxyRes.arrayBuffer() : new ArrayBuffer(0);
    const body = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: proxyRes.status,
      headers,
      body,
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'text/plain' },
      body: `Proxy Error: ${err.message}`,
    };
  }
};
