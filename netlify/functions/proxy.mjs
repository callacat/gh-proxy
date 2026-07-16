import { extractGitHubUrl, proxyFetch, handlePreflight } from '../../src/proxy-core.js';

export const handler = async (event) => {
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

  return {
    statusCode: proxyRes.status,
    headers,
    body: proxyRes.body ? await proxyRes.text() : '',
    isBase64Encoded: false,
  };
};
