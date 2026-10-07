// Minimal structural types so users don't need @types/node from us.
interface NodeRequest extends AsyncIterable<Uint8Array | string> {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
  /** Set by body parsers like `express.json()`. */
  body?: unknown
}
interface NodeResponse {
  writeHead(status: number, headers: Record<string, string>): unknown
  write(chunk: Uint8Array): unknown
  end(): unknown
  on(event: 'close', fn: () => void): unknown
}

/** Adapts a Web handler to Express / node:http `(req, res)`. */
export function toNodeHandler(
  handler: (req: Request) => Promise<Response>,
): (req: NodeRequest, res: NodeResponse) => Promise<void> {
  return async (req, res) => {
    const abort = new AbortController()
    res.on('close', () => abort.abort())
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined && k !== 'content-length')
        headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    let body: string | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body !== undefined) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      } else {
        body = ''
        const decoder = new TextDecoder()
        // Hard stop for huge bodies before buffering them; the handler enforces its own limit.
        for await (const chunk of req) {
          body += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
          if (body.length > 4 * 1024 * 1024) break
        }
      }
    }
    const response = await handler(
      new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), {
        method: req.method ?? 'GET',
        headers,
        body: body ?? null,
        signal: abort.signal,
      }),
    )
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) {
      const reader = response.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
      } catch {}
    }
    res.end()
  }
}
