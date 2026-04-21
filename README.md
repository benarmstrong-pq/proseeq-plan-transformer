# Proseeq Plan Transformer

Internal tool — generates Proseeq-importable JSON from plain-language plan descriptions.

## What it does

Takes a plan name, dates, teams, and a description (plus an optional screenshot or PDF), calls the Anthropic API, and returns a `.json` file ready to import directly into Proseeq.

## Architecture

```
Browser (index.html)
    │
    │  POST /api/generate
    ▼
Cloudflare Pages Function (functions/api/generate.js)
    │
    │  Proxies request to Worker
    ▼
Cloudflare Worker (proseeq-plan-transformer-worker.pq-partners.workers.dev)
    │
    │  Injects API key + system prompt, calls Anthropic
    ▼
Anthropic API (claude-sonnet-4-20250514)
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | The browser UI — no API key, no system prompt |
| `functions/api/generate.js` | Cloudflare Pages Function — proxies `/api/generate` to the Worker |
| `worker.js` | Cloudflare Worker — holds the Anthropic API key and system prompt server-side |

## Why this structure

- **API key never reaches the browser** — held as a secret environment variable in the Worker
- **System prompt never reaches the browser** — embedded in the Worker, not the HTML
- **Pages Function as proxy** — Cloudflare Pages `_redirects` doesn't support external URL proxying, so the Pages Function handles the `/api/generate` route and forwards to the Worker

## Access control

Access is gated via **Cloudflare Access** using Microsoft Entra ID (Azure AD) as the identity provider. Only accounts with `@proseeq.com` or `@pq-partners.com` email addresses can authenticate.

## Deployment

### Pages (frontend)
Deploys automatically from the `main` branch of this repo via Cloudflare Pages.  
Production URL: `proseeq-plan-transformer.pages.dev`

### Worker (API proxy)
Deployed manually via the Cloudflare dashboard or Wrangler CLI.  
Worker URL: `proseeq-plan-transformer-worker.pq-partners.workers.dev`

The Worker requires one environment variable set as a **Secret** in the Cloudflare dashboard:
- `ANTHROPIC_API_KEY` — your Anthropic API key (from console.anthropic.com)

### To update the Worker code
1. Edit `worker.js` locally
2. Go to Cloudflare Dashboard → Workers & Pages → `proseeq-plan-transformer-worker`
3. Click **Edit code**, paste the updated `worker.js`, click **Deploy**

(The Worker is not connected to GitHub — it deploys manually to keep the API key management clean.)

## Usage costs

Each plan generation calls `claude-sonnet-4-20250514` with ~4KB system prompt + user input.  
Approximate cost: **$0.05–0.20 per generation** depending on plan complexity and any attached files.  
Monitor usage at console.anthropic.com.

