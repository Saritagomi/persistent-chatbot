/** Provider HTTP failure. `body` is for your server logs only. */
export class UpstreamError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`Upstream ${status}`)
    this.status = status
    this.body = body
  }
}

export async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new UpstreamError(res.status, (await res.text()).slice(0, 1000))
  return res.body
}
