/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTransport, readSSE } from '../src/core/stream'
import { collect, streamOf } from './helpers'

const wire =
  'data: {"t":"d","v":"Héllo"}\n\n: keep-alive\n\ndata: {"t":"d","v":" 🌍 world"}\n\ndata: {"t":"x"}\n\n'
const bytes = new TextEncoder().encode(wire)

describe('readSSE', () => {
  it('parses events', async () => {
    expect(await collect(readSSE(streamOf(bytes)))).toEqual([
      { t: 'd', v: 'Héllo' },
      { t: 'd', v: ' 🌍 world' },
      { t: 'x' },
    ])
  })

  it('same output when split at every byte offset (incl. mid UTF-8)', async () => {
    const expected = await collect(readSSE(streamOf(bytes)))
    for (let a = 1; a < bytes.length; a++) {
      expect(await collect(readSSE(streamOf(bytes, [a])))).toEqual(expected)
    }
    // byte-by-byte
    const all = Array.from({ length: bytes.length - 1 }, (_, i) => i + 1)
    expect(await collect(readSSE(streamOf(bytes, all)))).toEqual(expected)
  })

  it('handles CRLF and missing final blank line', async () => {
    const b = new TextEncoder().encode('data: {"a":1}\r\n\r\ndata: {"a":2}')
    expect(await collect(readSSE(streamOf(b)))).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('skips non-JSON data like [DONE]', async () => {
    const b = new TextEncoder().encode('data: [DONE]\n\ndata: {"a":1}\n\n')
    expect(await collect(readSSE(streamOf(b)))).toEqual([{ a: 1 }])
  })

  for (const name of ['anthropic', 'openai']) {
    it(`fuzz: ${name} fixture split anywhere`, async () => {
      const fx = readFileSync(`test/fixtures/${name}.sse`)
      const expected = await collect(readSSE(streamOf(fx)))
      expect(expected.length).toBeGreaterThan(3)
      for (let a = 1; a < fx.length; a += 3) {
        expect(await collect(readSSE(streamOf(fx, [a, Math.min(a + 7, fx.length - 1)])))).toEqual(
          expected,
        )
      }
    })
  }
})

describe('fetchTransport', () => {
  afterEach(() => vi.unstubAllGlobals())
  const signal = new AbortController().signal

  it('yields deltas and posts messages only', async () => {
    const fetch = vi.fn(async () => new Response(streamOf(bytes)))
    vi.stubGlobal('fetch', fetch)
    const out = await collect(
      fetchTransport('/api/chat')([{ role: 'user', content: 'hi' }], signal),
    )
    expect(out.join('')).toBe('Héllo 🌍 world')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/chat')
    expect(JSON.parse(init.body as string)).toEqual({ messages: [{ role: 'user', content: 'hi' }] })
  })

  it('throws error code from JSON error response', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'rate_limited' }, { status: 429 }))
    await expect(collect(fetchTransport('/x')([], signal))).rejects.toMatchObject({
      code: 'rate_limited',
    })
  })

  it('throws error code from stream error event', async () => {
    const b = new TextEncoder().encode(
      'data: {"t":"d","v":"a"}\n\ndata: {"t":"e","v":"upstream_error"}\n\n',
    )
    vi.stubGlobal('fetch', async () => new Response(streamOf(b)))
    await expect(collect(fetchTransport('/x')([], signal))).rejects.toMatchObject({
      code: 'upstream_error',
    })
  })

  it('stream closing without done = network_error', async () => {
    const b = new TextEncoder().encode('data: {"t":"d","v":"a"}\n\n')
    vi.stubGlobal('fetch', async () => new Response(streamOf(b)))
    await expect(collect(fetchTransport('/x')([], signal))).rejects.toMatchObject({
      code: 'network_error',
    })
  })

  it('fetch failure = network_error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(collect(fetchTransport('/x')([], signal))).rejects.toMatchObject({
      code: 'network_error',
    })
  })
})
