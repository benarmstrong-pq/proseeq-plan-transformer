# Proseeq Plan Transformer

Internal tool — generates Proseeq-importable JSON from plain-language plan descriptions.

## Stack
- `index.html` — the browser UI (no API key, no system prompt)
- `worker.js` — Cloudflare Worker proxy (holds API key + system prompt server-side)
- Cloudflare Pages — serves the HTML
- Cloudflare Access — gates access to @proseeq.com and @pq-partners.com via Microsoft login

## Deployment
See internal setup notes for Cloudflare Access + Worker configuration.
