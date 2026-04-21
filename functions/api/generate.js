/**
 * Cloudflare Pages Function — /api/generate
 * Proxies plan generation requests to the Proseeq Worker.
 * This replaces the _redirects approach which doesn't support external proxy.
 */
export async function onRequestPost(context) {
  const WORKER_URL = "https://proseeq-plan-transformer-worker.pq-partners.workers.dev";

  const body = await context.request.text();

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const data = await response.text();

  return new Response(data, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
