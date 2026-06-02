// Cloudflare Worker - API 代理
// 部署方法：
// 1. 注册 Cloudflare 账号（免费）
// 2. 进入 Workers & Pages → 创建 Worker
// 3. 粘贴此代码 → 保存并部署
// 4. 复制 Worker URL（如 https://my-api-proxy.xxx.workers.dev）
// 5. 在游戏的 API 设置中填入 Worker URL 作为代理地址

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    var targetUrl = null;
    var url = new URL(request.url);

    if (url.searchParams.has('target')) {
      targetUrl = url.searchParams.get('target');
    } else if (request.method === 'POST') {
      try {
        var body = await request.json();
        if (body._proxyTarget) {
          targetUrl = body._proxyTarget;
          delete body._proxyTarget;
        }
      } catch (e) {}
    }

    if (!targetUrl) {
      return new Response(JSON.stringify({
        status: 'ok',
        message: 'Free Script API Proxy',
        usage: 'Add ?target=<api_url> to proxy requests',
        version: '1.0.0'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    try {
      var proxyHeaders = new Headers(request.headers);
      proxyHeaders.delete('host');
      proxyHeaders.delete('cf-connecting-ip');
      proxyHeaders.delete('cf-ray');
      proxyHeaders.delete('cf-visitor');
      proxyHeaders.delete('cf-worker');
      proxyHeaders.delete('x-forwarded-for');
      proxyHeaders.delete('x-real-ip');

      var fetchOptions = {
        method: request.method,
        headers: proxyHeaders,
      };

      if (request.method === 'POST') {
        var originalBody = await request.json();
        if (originalBody._proxyTarget) {
          delete originalBody._proxyTarget;
        }
        fetchOptions.body = JSON.stringify(originalBody);
      }

      var response = await fetch(targetUrl, fetchOptions);

      var responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Type');
      responseHeaders.delete('cf-ray');
      responseHeaders.delete('cf-cache-status');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (e) {
      return new Response(JSON.stringify({
        error: true,
        message: 'Proxy request failed: ' + e.message,
        target: targetUrl,
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};