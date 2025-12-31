#!/usr/bin/env node

/**
 * Railway startup script - deploys the Cloudflare Worker and displays status
 *
 * This runs when deployed on Railway:
 * 1. Deploys the worker to Cloudflare
 * 2. Starts a simple HTTP server showing the worker URL
 *
 * Required environment variables (set in Railway dashboard):
 *   CLOUDFLARE_API_TOKEN  - API token with Workers permission
 *   CLOUDFLARE_ACCOUNT_ID - Your Cloudflare account ID
 *
 * Optional:
 *   WORKER_NAME           - Custom worker name (default: telegram-api-proxy)
 *   ALLOWED_TOKENS        - Comma-separated bot tokens to allowlist
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = 'https://api.cloudflare.com/client/v4';

let deploymentStatus = {
  status: 'pending',
  workerUrl: null,
  error: null,
  timestamp: new Date().toISOString()
};

async function deployWorker() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const workerName = process.env.WORKER_NAME || 'telegram-api-proxy';
  const allowedTokens = process.env.ALLOWED_TOKENS || '';

  if (!apiToken || !accountId) {
    throw new Error(
      'Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID. ' +
      'Set these in your Railway service variables.'
    );
  }

  console.log(`Deploying worker "${workerName}" to Cloudflare...`);

  // Read the worker script
  const scriptPath = path.join(__dirname, '..', 'src', 'index.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

  // Prepare metadata
  const metadata = {
    main_module: 'index.js',
    compatibility_date: '2024-01-01',
    bindings: []
  };

  if (allowedTokens) {
    metadata.bindings.push({
      type: 'plain_text',
      name: 'ALLOWED_TOKENS',
      text: allowedTokens
    });
  }

  // Create FormData
  const formData = new FormData();
  formData.append('index.js', new Blob([scriptContent], { type: 'application/javascript+module' }), 'index.js');
  formData.append('metadata', JSON.stringify(metadata));

  // Deploy
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/workers/scripts/${workerName}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${apiToken}` },
      body: formData,
    }
  );

  const result = await response.json();

  if (!result.success) {
    throw new Error(`Deployment failed: ${JSON.stringify(result.errors)}`);
  }

  // Get account subdomain first
  const accountResponse = await fetch(
    `${API_BASE}/accounts/${accountId}/workers/subdomain`,
    { headers: { 'Authorization': `Bearer ${apiToken}` } }
  );
  const accountResult = await accountResponse.json();
  let subdomain = accountResult.result?.subdomain;

  // If no subdomain exists, we need to create one
  if (!subdomain) {
    console.log('No workers.dev subdomain found, attempting to enable...');
    // Try to get it from the worker's settings
    const workerResponse = await fetch(
      `${API_BASE}/accounts/${accountId}/workers/scripts/${workerName}`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );
    const workerResult = await workerResponse.json();
    console.log('Worker info:', JSON.stringify(workerResult.result, null, 2));
  }

  // Enable workers.dev route for this specific worker
  const enableSubdomainResponse = await fetch(
    `${API_BASE}/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: true }),
    }
  );
  const enableResult = await enableSubdomainResponse.json();
  console.log('Enable subdomain result:', JSON.stringify(enableResult, null, 2));

  // Re-fetch subdomain after enabling
  if (!subdomain) {
    const retryResponse = await fetch(
      `${API_BASE}/accounts/${accountId}/workers/subdomain`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );
    const retryResult = await retryResponse.json();
    subdomain = retryResult.result?.subdomain;
  }

  if (subdomain) {
    return `https://${workerName}.${subdomain}.workers.dev`;
  }

  // Fallback: construct URL from account ID (won't work but shows the pattern)
  console.log('Warning: Could not determine workers.dev subdomain');
  console.log('Please check your Cloudflare dashboard for the worker URL');
  return `https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}`;
}

function startStatusServer() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Telegram Proxy Deployer</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    .status { padding: 20px; border-radius: 8px; margin: 20px 0; }
    .success { background: #d4edda; border: 1px solid #c3e6cb; }
    .error { background: #f8d7da; border: 1px solid #f5c6cb; }
    .pending { background: #fff3cd; border: 1px solid #ffeeba; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 8px; overflow-x: auto; }
    a { color: #007bff; }
  </style>
</head>
<body>
  <h1>Telegram Bot API Proxy</h1>

  <div class="status ${deploymentStatus.status === 'success' ? 'success' : deploymentStatus.status === 'error' ? 'error' : 'pending'}">
    <strong>Status:</strong> ${deploymentStatus.status.toUpperCase()}
    ${deploymentStatus.workerUrl ? `<br><br><strong>Worker URL:</strong> <a href="${deploymentStatus.workerUrl}" target="_blank">${deploymentStatus.workerUrl}</a>` : ''}
    ${deploymentStatus.error ? `<br><br><strong>Error:</strong> ${deploymentStatus.error}` : ''}
  </div>

  ${deploymentStatus.workerUrl ? `
  <h2>Usage</h2>
  <p>Replace <code>api.telegram.org</code> with your worker URL:</p>
  <pre>
# Instead of:
https://api.telegram.org/bot&lt;TOKEN&gt;/sendMessage

# Use:
${deploymentStatus.workerUrl}/bot&lt;TOKEN&gt;/sendMessage</pre>

  <h3>Test it</h3>
  <pre>curl ${deploymentStatus.workerUrl}/</pre>
  ` : ''}

  ${deploymentStatus.status === 'error' ? `
  <h2>Troubleshooting</h2>
  <p>Make sure you've set these environment variables in Railway:</p>
  <ul>
    <li><code>CLOUDFLARE_API_TOKEN</code> - Get from <a href="https://dash.cloudflare.com/profile/api-tokens">Cloudflare API Tokens</a></li>
    <li><code>CLOUDFLARE_ACCOUNT_ID</code> - Found in your <a href="https://dash.cloudflare.com">Cloudflare dashboard</a> sidebar</li>
  </ul>
  ` : ''}

  <p style="color: #666; margin-top: 40px; font-size: 14px;">
    Last updated: ${deploymentStatus.timestamp}
  </p>
</body>
</html>`;

    res.end(html);
  });

  server.listen(port, () => {
    console.log(`Status server running on port ${port}`);
  });
}

async function main() {
  // Start the status server immediately
  startStatusServer();

  // Attempt deployment
  try {
    const workerUrl = await deployWorker();
    deploymentStatus = {
      status: 'success',
      workerUrl,
      error: null,
      timestamp: new Date().toISOString()
    };
    console.log('');
    console.log('='.repeat(60));
    console.log('SUCCESS! Worker deployed to:', workerUrl);
    console.log('='.repeat(60));
    console.log('');
  } catch (error) {
    deploymentStatus = {
      status: 'error',
      workerUrl: null,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    console.error('Deployment failed:', error.message);
  }
}

main();
