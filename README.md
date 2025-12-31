# Telegram Bot API Proxy (Cloudflare Workers)

A simple Cloudflare Worker that proxies requests to the Telegram Bot API, bypassing IP-based restrictions that block cloud provider IPs.

## Why is this needed?

Telegram blocks requests from many cloud provider IP ranges (including GCP, AWS, Azure, Railway, Heroku, etc.) as an anti-spam measure. This proxy routes your API requests through Cloudflare's edge network, which uses different IP ranges that aren't blocked.

## Quick Deploy

### Option 1: One-Command Deploy (No Wrangler Login Required)

Deploy directly using Cloudflare API - perfect for CI/CD or Railway:

```bash
# Set your Cloudflare credentials
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"

# Optional: restrict to specific bot tokens
export ALLOWED_TOKENS="token1,token2"

# Deploy
npm run deploy:api
```

**To get your credentials:**
1. **API Token**: Go to https://dash.cloudflare.com/profile/api-tokens → Create Token → Use "Edit Cloudflare Workers" template
2. **Account ID**: Visit https://dash.cloudflare.com → shown in the right sidebar URL or overview page. You can click the three dots menu and copy Account ID.

### Option 2: Deploy from Railway (One-Click)

Deploy this repo to Railway - it will automatically deploy the worker to Cloudflare:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/ndneighbor/telegram-cloudflare-proxy)

**Required environment variables** (set in Railway dashboard):
- `CLOUDFLARE_API_TOKEN` - API token with Workers permission
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

Once deployed, Railway will show a status page with your worker URL.

### Option 3: Deploy with Wrangler CLI

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Login to Cloudflare:**
   ```bash
   npx wrangler login
   ```

3. **Deploy:**
   ```bash
   npm run deploy
   ```

4. **Get your Worker URL** (shown after deploy, e.g., `https://telegram-api-proxy.your-account.workers.dev`)

### Option 4: Deploy via Cloudflare Dashboard

1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
2. Click "Create a Service"
3. Name it `telegram-api-proxy`
4. Copy the contents of `src/index.js` into the editor
5. Click "Save and Deploy"

## Usage

Simply replace `api.telegram.org` with your Worker URL in your bot code.

### Python (python-telegram-bot)

```python
from telegram.ext import Application

application = (
    Application.builder()
    .token("YOUR_BOT_TOKEN")
    .base_url("https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev/bot")
    .build()
)
```

### Python (aiogram)

```python
from aiogram import Bot
from aiogram.client.session.aiohttp import AiohttpSession

session = AiohttpSession(api="https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev")
bot = Bot(token="YOUR_BOT_TOKEN", session=session)
```

### Python (telebot/pyTelegramBotAPI)

```python
import telebot

bot = telebot.TeleBot("YOUR_BOT_TOKEN")
telebot.apihelper.API_URL = "https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev/bot{0}/{1}"
```

### Node.js (node-telegram-bot-api)

```javascript
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot('YOUR_BOT_TOKEN', {
  baseApiUrl: 'https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev/bot'
});
```

### Node.js (telegraf)

```javascript
const { Telegraf } = require('telegraf');

const bot = new Telegraf('YOUR_BOT_TOKEN', {
  telegram: {
    apiRoot: 'https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev'
  }
});
```

### Node.js (grammY)

```javascript
const { Bot } = require('grammy');

const bot = new Bot('YOUR_BOT_TOKEN', {
  client: {
    baseFetchConfig: {
      baseUrl: 'https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev'
    }
  }
});
```

### Go (telebot)

```go
import tele "gopkg.in/telebot.v3"

bot, err := tele.NewBot(tele.Settings{
    Token: "YOUR_BOT_TOKEN",
    URL:   "https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev",
})
```

### Raw HTTP Request

```bash
# Instead of:
curl https://api.telegram.org/bot<token>/getMe

# Use:
curl https://telegram-api-proxy.YOUR-ACCOUNT.workers.dev/bot<token>/getMe
```

## Optional: Token Allowlist

For additional security, you can restrict the proxy to only allow specific bot tokens:

```bash
npx wrangler secret put ALLOWED_TOKENS
# Enter comma-separated tokens: token1,token2,token3
```

## Free Tier Limits

Cloudflare Workers free tier includes:
- 100,000 requests per day
- 10ms CPU time per request

This is sufficient for most bots. If you need more, Cloudflare's paid plan starts at $5/month for 10 million requests. In the meantime, Railway is working to restore IP access for all blocks to the telegram API.

## Troubleshooting

### Still getting blocked?

1. Make sure you're using the Worker URL, not `api.telegram.org`
2. Check that the Worker deployed successfully: visit `https://your-worker.workers.dev/` - you should see a JSON health response
3. Test with a simple getMe request:
   ```bash
   curl https://your-worker.workers.dev/bot<YOUR_TOKEN>/getMe
   ```

### CORS errors in browser?

The proxy includes CORS headers by default. If you're still having issues, check that your request is going to the Worker URL.

## License

MIT
