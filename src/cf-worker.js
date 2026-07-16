// cf-worker.js — Cloudflare Worker 入口
import { extractGitHubUrl, proxyFetch, handlePreflight } from './proxy-core.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') return handlePreflight();
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const targetUrl = extractGitHubUrl(pathname);
    if (!targetUrl) {
      return new Response(
        '用法: /https://github.com/user/repo/...\n  或: /github/user/repo/...\n  或: /gh/user/repo/...',
        { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }

    // 裸仓库路径 → 302 到 zipball
    if (/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(targetUrl)) {
      return Response.redirect(targetUrl + '/archive/refs/heads/main.zip', 302);
    }

    return proxyFetch(targetUrl, request);
  },
};
