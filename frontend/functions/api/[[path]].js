// Cloudflare Pages Function to proxy API requests to Beanstalk backend
// Configure BACKEND_URL in Cloudflare Pages environment variables
// Note: If Beanstalk doesn't have HTTPS configured, use http:// (workaround for SSL issues)
const BACKEND_URL = process.env.BACKEND_URL || 'http://NYCLPC-RDH-Staging-env-1.eba-2rxzfa4v.us-east-1.elasticbeanstalk.com';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Use BACKEND_URL as-is (supports both http:// and https://)
  // If no protocol specified, default to http:// (workaround for Beanstalk HTTPS issues)
  let backendBase = BACKEND_URL;
  if (!BACKEND_URL.startsWith('http://') && !BACKEND_URL.startsWith('https://')) {
    // Default to http:// if Beanstalk doesn't have HTTPS configured
    backendBase = `http://${BACKEND_URL}`;
  }
  
  // Build backend URL with the full path
  const backendUrl = `${backendBase}${url.pathname}${url.search}`;
  
  // Get origin from request for CORS
  const origin = request.headers.get('Origin');
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['*'];
  
  // Forward the request to backend
  const backendRequest = new Request(backendUrl, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers),
      'Host': new URL(backendBase).hostname,
    },
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
  });
  
  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigins.includes('*') || allowedOrigins.includes(origin) ? (origin || '*') : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  
  // Get response from backend
  const response = await fetch(backendRequest);
  
  // Create new response with CORS headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers),
      'Access-Control-Allow-Origin': allowedOrigins.includes('*') || allowedOrigins.includes(origin) ? (origin || '*') : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
  
  return newResponse;
}
