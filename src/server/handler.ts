import type { ErrorCode, StreamEvent } from '../core/types'
import { anthropic } from './providers/anthropic'
import { openai } from './providers/openai'
import type { ChatHandlerOptions } from './types'
import { UpstreamError } from './upstream'
import { validate } from './validate'

const STATUS: Partial<Record<ErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden_origin: 403,
  payload_too_large: 413,
  rate_limited: 429,
}

const defaultOnError = (e: unknown) => {
  console.error('[persistent-chatbot]', e instanceof UpstreamError ? `${e.message}: ${e.body}` : e)
}

/**
 * Web-standard handler `(Request) => Promise<Response>`.
 * Works in Next.js route handlers, Hono, Bun, Deno, Cloudflare Workers.
 * For Express / node:http wrap with `toNodeHandler`.
 */
export function createChatHandler(
  options: ChatHandlerOptions,
): (req: Request) => Promise<Response> {
  const {
    provider,
    apiKey = '',
    model,
    systemPrompt,
    maxTokens = 1024,
    baseURL,
    limits = {},
    allowedOrigins,
    authorize,
    rateLimit,
    onFinish,
    onError = defaultOnError,
  } = options
  const { maxMessages = 40, maxChars = 8000, maxBodyBytes = 512 * 1024 } = limits
  const run = provider === 'anthropic' ? anthropic : provider === 'openai' ? openai : provider
  const encoder = new TextEncoder()

  return async (req) => {
    const origin = req.headers.get('origin')
    const cors: Record<string, string> =
      origin && allowedOrigins?.includes(origin)
        ? {
            'access-control-allow-origin': origin,
            'access-control-allow-headers': 'content-type',
            vary: 'origin',
          }
        : {}
    const fail = (code: ErrorCode) =>
      new Response(JSON.stringify({ error: code }), {
        status: STATUS[code] ?? 500,
        headers: { 'content-type': 'application/json', ...cors },
      })

    if (origin && allowedOrigins && !cors['access-control-allow-origin']) {
      return fail('forbidden_origin')
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return fail('bad_request')

    let messages: ReturnType<typeof validate>
    let system: string | undefined
    try {
      if (authorize && !(await authorize(req))) return fail('unauthorized')
      if (rateLimit && !(await rateLimit(req))) return fail('rate_limited')
      if (Number(req.headers.get('content-length')) > maxBodyBytes) {
        return fail('payload_too_large')
      }
      const raw = await req.text()
      if (encoder.encode(raw).length > maxBodyBytes) return fail('payload_too_large')
      try {
        messages = validate(JSON.parse(raw), maxMessages, maxChars)
      } catch {
        messages = null
      }
      if (!messages) return fail('bad_request')
      system = typeof systemPrompt === 'function' ? await systemPrompt(req) : systemPrompt
    } catch (e) {
      onError(e)
      return fail('upstream_error')
    }

    const input = messages
    const abort = new AbortController()
    req.signal?.addEventListener('abort', () => abort.abort())
    let iterator: AsyncIterator<string> | undefined
    let text = ''
    const send = (ctl: ReadableStreamDefaultController<Uint8Array>, ev: StreamEvent) =>
      ctl.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))

    const body = new ReadableStream<Uint8Array>({
      async pull(ctl) {
        try {
          iterator ??= run({
            messages: input,
            model,
            maxTokens,
            apiKey,
            signal: abort.signal,
            ...(system ? { system } : {}),
            ...(baseURL ? { baseURL } : {}),
          })[Symbol.asyncIterator]()
          const r = await iterator.next()
          if (!r.done) {
            if (r.value) {
              text += r.value
              send(ctl, { t: 'd', v: r.value })
            }
            return
          }
          send(ctl, { t: 'x' })
          try {
            await onFinish?.({ messages: input, text, request: req })
          } catch (e) {
            onError(e)
          }
        } catch (e) {
          if (abort.signal.aborted) return ctl.close()
          onError(e)
          const code =
            e instanceof UpstreamError && e.status === 429 ? 'rate_limited' : 'upstream_error'
          send(ctl, { t: 'e', v: code })
        }
        ctl.close()
      },
      cancel() {
        abort.abort()
        iterator?.return?.()
      },
    })

    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
        ...cors,
      },
    })
  }
}
