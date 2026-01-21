// Cloudflare Pages Function to proxy /api/* to the backend
// Set BACKEND_URL and optionally ALLOWED_ORIGINS in Cloudflare Pages → Settings → Environment variables
//
// BACKEND_URL: base URL including any path prefix (no trailing slash).
// Staging (EC2): https://acris.nyclpc.com/nyclpcrdh/v1 — /api/health becomes .../nyclpcrdh/v1/api/health

const DEFAULT_BACKEND = 'https://acris.nyclpc.com/nyclpcrdh/v1';

export async function onRequest(context) {
  const { request, env } = context;

  const raw = (env?.BACKEND_URL || DEFAULT_BACKEND).trim();
  const base = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;

  const url = new URL(request.url);
  const backendUrl = `${base}${url.pathname}${url.search}`;

  const allowed = (env?.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin');
  const corsOrigin = allowed.includes('*') || (origin && allowed.includes(origin)) ? (origin || '*') : allowed[0];

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const reqHeaders = new Headers();
  reqHeaders.set('Host', new URL(base).hostname);
  const ct = request.headers.get('Content-Type');
  if (ct) reqHeaders.set('Content-Type', ct);
  const auth = request.headers.get('Authorization');
  if (auth) reqHeaders.set('Authorization', auth);

  const backendRequest = new Request(backendUrl, {
    method: request.method,
    headers: reqHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
  });

  let response;
  try {
    response = await fetch(backendRequest);
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: 'error',
        database: 'disconnected',
        error: 'Backend unreachable',
        detail: err?.message || 'fetch failed',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  }

  const resHeaders = new Headers();
  const resCt = response.headers.get('Content-Type');
  if (resCt) resHeaders.set('Content-Type', resCt);
  resHeaders.set('Access-Control-Allow-Origin', corsOrigin);
  resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  resHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  resHeaders.set('Access-Control-Allow-Credentials', 'true');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: resHeaders,
  });
}
