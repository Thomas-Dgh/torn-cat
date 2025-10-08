// Cloudflare Worker Proxy for CAT Script with WebSocket support
// Deploy on: https://workers.cloudflare.com/

export default {
  async fetch(request, env, ctx) {
    // Handle WebSocket upgrade requests
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request);
    }
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400',
    };

    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    try {
      const url = new URL(request.url);
      const targetUrl = url.searchParams.get('url');
      
      if (!targetUrl) {
        return new Response(JSON.stringify({ 
          error: 'Missing URL parameter' 
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Validate target domains for security
      const allowedDomains = [
        'api.torn.com',
        'tornstats.com',
        'www.lol-manager.com',
        'wdgvdggkhxeugyusaymo.supabase.co'
      ];
      
      const targetDomain = new URL(targetUrl).hostname;
      if (!allowedDomains.some(domain => targetDomain.includes(domain))) {
        return new Response(JSON.stringify({ 
          error: 'Domain not allowed' 
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Prepare the proxied request
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      });

      // Remove the Host header to avoid conflicts
      proxyRequest.headers.delete('Host');

      // Make the request to the target
      const response = await fetch(proxyRequest);
      
      // Create new response with CORS headers
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers),
          ...corsHeaders
        }
      });

      return newResponse;

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'Proxy error: ' + error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },
};

// WebSocket handler function
async function handleWebSocket(request) {
  const url = new URL(request.url);
  const targetWsUrl = url.searchParams.get('ws_url');
  
  if (!targetWsUrl) {
    return new Response('Missing ws_url parameter', { status: 400 });
  }

  // Validate WebSocket domains
  const allowedWsDomains = [
    'wdgvdggkhxeugyusaymo.supabase.co'
  ];
  
  const targetDomain = new URL(targetWsUrl).hostname;
  if (!allowedWsDomains.some(domain => targetDomain.includes(domain))) {
    return new Response('WebSocket domain not allowed', { status: 403 });
  }

  // Create WebSocket pair
  const webSocketPair = new WebSocketPair();
  const [client, server] = [webSocketPair[0], webSocketPair[1]];

  // Accept the WebSocket connection
  server.accept();

  // Connect to target WebSocket
  const targetWs = fetch(targetWsUrl, {
    headers: {
      'Upgrade': 'websocket',
    },
  }).then(response => {
    if (!response.webSocket) {
      throw new Error('Target did not accept WebSocket upgrade');
    }
    
    const targetSocket = response.webSocket;
    targetSocket.accept();

    // Forward messages from target to client
    targetSocket.addEventListener('message', (event) => {
      try {
        server.send(event.data);
      } catch (e) {
        console.error('Error forwarding from target:', e);
      }
    });

    // Forward messages from client to target
    server.addEventListener('message', (event) => {
      try {
        targetSocket.send(event.data);
      } catch (e) {
        console.error('Error forwarding to target:', e);
      }
    });

    // Handle target close
    targetSocket.addEventListener('close', (event) => {
      server.close(event.code, event.reason);
    });

    // Handle target error
    targetSocket.addEventListener('error', () => {
      server.close(1011, 'Target WebSocket error');
    });

    // Handle client close
    server.addEventListener('close', () => {
      targetSocket.close();
    });

    return targetSocket;
  }).catch(error => {
    console.error('WebSocket proxy error:', error);
    server.close(1011, 'Proxy connection failed');
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}