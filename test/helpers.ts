import type { Transport } from '../src/core/types'

/** Body stream that emits `bytes` split at the given offsets. */
export const streamOf = (bytes: Uint8Array, cuts: number[] = []): ReadableStream<Uint8Array> => {
  const points = [0, ...cuts, bytes.length]
  let i = 0
  return new ReadableStream({
    pull(ctl) {
      if (i >= points.length - 1) return ctl.close()
      ctl.enqueue(bytes.slice(points[i], points[i + 1]))
      i++
    },
  })
}

export const collect = async <T>(it: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

/** Transport yielding given deltas; waits for `gate` before finishing if provided. */
export const fakeTransport = (
  deltas: string[],
  opts: { fail?: string; gate?: Promise<void> } = {},
): Transport =>
  async function* (_messages, signal) {
    for (const d of deltas) {
      await Promise.resolve()
      yield d
    }
    if (opts.gate) {
      await Promise.race([
        opts.gate,
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('abort'))),
        ),
      ])
    }
    if (opts.fail) throw Object.assign(new Error(opts.fail), { code: opts.fail })
  }

export const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))
