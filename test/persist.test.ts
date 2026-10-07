import { describe, expect, it } from 'vitest'
import { load, save } from '../src/core/persist'
import { memoryStorage } from '../src/core/storage'
import type { Message, StorageAdapter } from '../src/core/types'

const msg = (i: number, status: Message['status'] = 'complete'): Message => ({
  id: String(i),
  role: i % 2 ? 'assistant' : 'user',
  content: `m${i}`,
  createdAt: i,
  status,
})

describe('persist', () => {
  it('round-trips and caps to max', async () => {
    const s = memoryStorage()
    await save(s, 'k', [msg(0), msg(1), msg(2)], 2)
    expect((await load(s, 'k')).map((m) => m.id)).toEqual(['1', '2'])
  })

  it('marks streaming messages as interrupted on load', async () => {
    const s = memoryStorage()
    await save(s, 'k', [msg(0), msg(1, 'streaming')], 10)
    expect((await load(s, 'k'))[1]?.status).toBe('interrupted')
  })

  it('ignores corrupt, unknown version, and tampered data', async () => {
    const s = memoryStorage()
    s.set('a', '{nope')
    s.set('b', JSON.stringify({ v: 9, messages: [] }))
    s.set(
      'c',
      JSON.stringify({
        v: 1,
        updatedAt: 0,
        messages: [{ role: 'system', content: 'x', id: '1' }, null],
      }),
    )
    expect(await load(s, 'a')).toEqual([])
    expect(await load(s, 'b')).toEqual([])
    expect(await load(s, 'c')).toEqual([])
    expect(await load(s, 'missing')).toEqual([])
  })

  it('drops history older than ttl', async () => {
    const s = memoryStorage()
    s.set('k', JSON.stringify({ v: 1, updatedAt: Date.now() - 10_000, messages: [msg(0)] }))
    expect(await load(s, 'k', 5_000)).toEqual([])
    expect(await load(s, 'k', 60_000)).toHaveLength(1)
  })

  it('on quota error drops oldest messages and retries, never throws', async () => {
    const inner = memoryStorage()
    const quota: StorageAdapter = {
      ...inner,
      set(k, v) {
        if (v.length > 300) throw new DOMException('full', 'QuotaExceededError')
        inner.set(k, v)
      },
    }
    const list = Array.from({ length: 20 }, (_, i) => msg(i))
    await save(quota, 'k', list, 100)
    const saved = await load(inner, 'k')
    expect(saved.length).toBeGreaterThan(0)
    expect(saved.at(-1)?.id).toBe('19')
    const broken: StorageAdapter = { ...inner, set: () => Promise.reject(new Error('x')) }
    await expect(save(broken, 'k', list, 100)).resolves.toBeUndefined()
  })
})
