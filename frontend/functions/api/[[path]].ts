// CF Pages Function — proxy /api/* to Worker
// Deployed automatically with `wrangler pages deploy`

export async function onRequest(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url)
  const workerUrl = 'https://yt-smm-exchange-api.linkdev.workers.dev'

  // Rewrite path: /api/tasks/feed → /api/tasks/feed (same path)
  const target = `${workerUrl}${url.pathname}${url.search}`

  const req = new Request(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? null : context.request.body,
    redirect: 'follow',
  })

  return fetch(req)
}
