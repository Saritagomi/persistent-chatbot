import type { ChatMessage, ErrorCode, StreamEvent, Transport } from './types'

/** Error carrying a generic `ErrorCode`, safe to show to users. */
export const chatError = (code: ErrorCode): Error & { code: ErrorCode } =>
  Object.assign(new Error(code), { code })

/**
 * Reads an SSE body and yields the JSON of every `data:` line.
 * Handles chunks split anywhere (mid-line, mid UTF-8 char). Non-JSON data is skipped.
 */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buf += decoder.decode(value, { stream: !done }).replace(/\r/g, '')
      let end = buf.indexOf('\n\n')
      while (end >= 0 || (done && buf)) {
        if (end < 0) end = buf.length
        for (const line of buf.slice(0, end).split('\n')) {
          if (!line.startsWith('data:')) continue
          try {
            yield JSON.parse(line.slice(5))
          } catch {}
        }
        buf = buf.slice(end + 2)
        end = buf.indexOf('\n\n')
      }
      if (done) return
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

/** Default transport: POST to your endpoint, read our wire protocol (docs/protocol.md). */
export const fetchTransport = (endpoint: string, headers?: Record<string, string>): Transport =>
  async function* (messages: ChatMessage[], signal: AbortSignal) {
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ messages }),
        signal,
      })
    } catch {
      throw chatError(signal.aborted ? 'aborted' : 'network_error')
    }
    if (!res.ok || !res.body) {
      let code: ErrorCode = 'upstream_error'
      try {
        code = (await res.json()).error || code
      } catch {}
      throw chatError(code)
    }
    try {
      for await (const ev of readSSE(res.body) as AsyncGenerator<StreamEvent>) {
        if (ev.t === 'd') yield ev.v
        else if (ev.t === 'e') throw chatError(ev.v)
        else if (ev.t === 'x') return
      }
    } catch (e) {
      throw (e as { code?: ErrorCode }).code
        ? e
        : chatError(signal.aborted ? 'aborted' : 'network_error')
    }
    throw chatError('network_error')
  }
