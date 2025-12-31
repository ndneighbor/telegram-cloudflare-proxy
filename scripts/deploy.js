#!/usr/bin/env node

/**
 * Deploys the Telegram proxy worker to Cloudflare
 *
 * Required environment variables:
 *   CLOUDFLARE_API_TOKEN  - API token with Workers permission
 *   CLOUDFLARE_ACCOUNT_ID - Your Cloudflare account ID
 *
 * Optional:
 *   WORKER_NAME           - Custom worker name (default: telegram-api-proxy)
 *   ALLOWED_TOKENS        - Comma-separated bot tokens to allowlist
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.cloudflare.com/client/v4';

async function main() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const workerName = process.env.WORKER_NAME || 'telegram-api-proxy';
  const allowedTokens = process.env.ALLOWED_TOKENS || '';

  if (!apiToken || !accountId) {
    console.error('Error: Missing required environment variables');
    console.error('');
    console.error('Required:');
    console.error('  CLOUDFLARE_API_TOKEN  - API token with Workers Scripts permission');
    console.error('  CLOUDFLARE_ACCOUNT_ID - Your Cloudflare account ID');
    console.error('');
    console.error('To get these:');
    console.error('  1. Go to https://dash.cloudflare.com/profile/api-tokens');
    console.error('  2. Create a token with "Edit Cloudflare Workers" permission');
    console.error('  3. Find your Account ID at https://dash.cloudflare.com (right sidebar)');
    process.exit(1);
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

  // Add ALLOWED_TOKENS binding if provided
  if (allowedTokens) {
    metadata.bindings.push({
      type: 'plain_text',
      name: 'ALLOWED_TOKENS',
      text: allowedTokens
    });
  }

  // Create FormData for the upload
  const formData = new FormData();

  // Add the worker script as a module
  formData.append('index.js', new Blob([scriptContent], { type: 'application/javascript+module' }), 'index.js');

  // Add metadata
  formData.append('metadata', JSON.stringify(metadata));

  try {
    // Deploy the worker
    const response = await fetch(
      `${API_BASE}/accounts/${accountId}/workers/scripts/${workerName}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
        body: formData,
      }
    );

    const result = await response.json();

    if (!result.success) {
      console.error('Deployment failed:');
      console.error(JSON.stringify(result.errors, null, 2));
      process.exit(1);
    }

    console.log('Worker deployed successfully!');

    // Enable the workers.dev subdomain route
    const subdomainResponse = await fetch(
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

    // Get the subdomain
    const subdomainResult = await subdomainResponse.json();

    // Get account subdomain
    const accountResponse = await fetch(
      `${API_BASE}/accounts/${accountId}/workers/subdomain`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
      }
    );

    const accountResult = await accountResponse.json();
    const subdomain = accountResult.result?.subdomain;

    if (subdomain) {
      const workerUrl = `https://${workerName}.${subdomain}.workers.dev`;
      console.log('');
      console.log('='.repeat(60));
      console.log('Worker URL:', workerUrl);
      console.log('='.repeat(60));
      console.log('');
      console.log('Update your bot to use this base URL:');
      console.log(`  ${workerUrl}/bot<YOUR_TOKEN>/<method>`);
      console.log('');
      console.log('Test it:');
      console.log(`  curl ${workerUrl}/`);
    } else {
      console.log('');
      console.log('Worker deployed! Find your URL at:');
      console.log(`https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}`);
    }

  } catch (error) {
    console.error('Deployment error:', error.message);
    process.exit(1);
  }
}

main();
