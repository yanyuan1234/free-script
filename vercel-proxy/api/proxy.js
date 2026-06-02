export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('target');

  if (!targetUrl) {
    return new Response(JSON.stringify({
      status: 'ok',
      message: 'API Proxy is running',
      usage: 'Append ?target=ENCODED_URL to proxy requests',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('connection');

    const targetRequest = new Request(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    });

    const response = await fetch(targetRequest);

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    newHeaders.delete('content-encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Proxy request failed',
      message: err.message,
      target: targetUrl,
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = {
  runtime: 'edge',
};
