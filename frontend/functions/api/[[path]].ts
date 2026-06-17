// CF Pages Function — proxy /api/* to Worker
// Deployed automatically with `wrangler pages deploy`

export async function onRequest(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url)
  const workerUrl = 'https://yt-smm-exchange-api.linkdev.workers.dev'

  const target = `${workerUrl}${url.pathname}${url.search}`

  // Forward all headers + inject original host so BA cookie validation passes
  const headers = new Headers(context.request.headers)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', 'https')

  const req = new Request(target, {
    method: context.request.method,
    headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? null : context.request.body,
    redirect: 'manual',
  })

  const res = await fetch(req)

  // For redirects: pass through with Location header intact
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location') ?? '/'
    const headers = new Headers(res.headers)
    return new Response(null, { status: res.status, headers })
  }

  return res
}
