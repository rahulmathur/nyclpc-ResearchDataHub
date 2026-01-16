// Cloudflare Pages Function to proxy API requests to Beanstalk backend
const BACKEND_URL = 'http://NYCLPC-RDH-Staging-env-1.eba-2rxzfa4v.us-east-1.elasticbeanstalk.com';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Build backend URL with the full path
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;
  
  // Forward the request to backend
  const backendRequest = new Request(backendUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
  });
  
  // Get response from backend
  const response = await fetch(backendRequest);
  
  // Create new response with CORS headers
  const newResponse = new Response(response.body, response);
  
  // Add CORS headers
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  
  return newResponse;
}
