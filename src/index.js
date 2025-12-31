/**
 * Telegram Bot API Proxy for Cloudflare Workers
 *
 * This worker proxies requests to the Telegram Bot API through Cloudflare's
 * edge network, bypassing IP-based restrictions that block cloud provider IPs.
 *
 * Usage:
 *   Replace: https://api.telegram.org/bot<token>/sendMessage
 *   With:    https://your-worker.workers.dev/bot<token>/sendMessage
 */

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders(),
    });
  }

  // Health check endpoint
  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'telegram-api-proxy',
      usage: 'Replace api.telegram.org with this worker URL'
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
    });
  }

  // Validate path starts with /bot (Telegram API format)
  if (!url.pathname.startsWith('/bot')) {
    return new Response(JSON.stringify({
      error: 'Invalid path. Expected /bot<token>/<method>',
      example: '/botYOUR_TOKEN/sendMessage'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
    });
  }

  // Optional: Rate limiting using Cloudflare's built-in features
  // You can configure this in the Cloudflare dashboard

  // Optional: Token allowlist for additional security
  if (env.ALLOWED_TOKENS) {
    const tokenMatch = url.pathname.match(/^\/bot([^/]+)/);
    if (tokenMatch) {
      const token = tokenMatch[1];
      const allowedTokens = env.ALLOWED_TOKENS.split(',').map(t => t.trim());
      if (!allowedTokens.includes(token)) {
        return new Response(JSON.stringify({
          error: 'Token not in allowlist'
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
          },
        });
      }
    }
  }

  // Construct Telegram API URL
  const telegramUrl = `https://api.telegram.org${url.pathname}${url.search}`;

  try {
    // Forward the request to Telegram
    const telegramRequest = new Request(telegramUrl, {
      method: request.method,
      headers: filterHeaders(request.headers),
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? request.body
        : undefined,
    });

    const response = await fetch(telegramRequest);

    // Return response with CORS headers
    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to proxy request to Telegram',
      message: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      },
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function filterHeaders(headers) {
  const filtered = new Headers();
  const allowedHeaders = [
    'content-type',
    'accept',
    'accept-language',
    'content-length',
  ];

  for (const [key, value] of headers) {
    if (allowedHeaders.includes(key.toLowerCase())) {
      filtered.set(key, value);
    }
  }

  return filtered;
}
