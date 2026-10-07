import { describe, expect, it, vi } from 'vitest'
import { createChat } from '../src/core/chat'
import { memoryStorage } from '../src/core/storage'
import { fakeTransport, tick } from './helpers'

describe('createChat', () => {
  it('streams answer, persists, restores after "refresh"', async () => {
    const storage = memoryStorage()
    const chat = createChat({ storage, transport: fakeTransport(['Hel', 'lo ', '**you**']) })
    chat.connect()
    await chat.send('Hi')
    await tick()
    const { messages, status } = chat.getState()
    expect(status).toBe('idle')
    expect(messages.map((m) => [m.role, m.content, m.status])).toEqual([
      ['user', 'Hi', 'complete'],
      ['assistant', 'Hello **you**', 'complete'],
    ])
    const after = createChat({ storage, transport: fakeTransport([]) })
    after.connect()
    await tick()
    expect(after.getState().messages).toEqual(messages)
  })

  it('refresh mid-stream restores partial answer as interrupted, retry regenerates', async () => {
    const storage = memoryStorage()
    let release = () => {}
    const gate = new Promise<void>((r) => {
      release = r
    })
    const chat = createChat({ storage, transport: fakeTransport(['partial'], { gate }) })
    const detach = chat.connect()
    const sending = chat.send('Q')
    await tick()
    detach() // simulates pagehide: flushes and saves
    const reloaded = createChat({ storage, transport: fakeTransport(['fresh']) })
    reloaded.connect()
    await tick()
    const last = reloaded.getState().messages[1]
    expect([last?.content, last?.status]).toEqual(['partial', 'interrupted'])
    await reloaded.retry()
    await tick()
    expect(reloaded.getState().messages.map((m) => m.content)).toEqual(['Q', 'fresh'])
    release()
    await sending
  })

  it('stop keeps partial text with status stopped', async () => {
    const chat = createChat({
      persist: false,
      transport: fakeTransport(['abc'], { gate: new Promise(() => {}) }),
    })
    chat.connect()
    const p = chat.send('Q')
    await tick()
    expect(chat.getState().status).toBe('streaming')
    chat.stop()
    await p
    const last = chat.getState().messages[1]
    expect([last?.content, last?.status]).toEqual(['abc', 'stopped'])
  })

  it('error keeps message with code and calls onError', async () => {
    const onError = vi.fn()
    const chat = createChat({
      persist: false,
      onError,
      transport: fakeTransport(['x'], { fail: 'rate_limited' }),
    })
    chat.connect()
    await chat.send('Q')
    const last = chat.getState().messages[1]
    expect([last?.content, last?.status, last?.error]).toEqual(['x', 'error', 'rate_limited'])
    expect(onError).toHaveBeenCalledWith('rate_limited')
  })

  it('sends only role/content of finished non-empty messages', async () => {
    const seen: unknown[] = []
    const chat = createChat({
      persist: false,
      transport: async function* (messages) {
        seen.push(messages)
        yield 'ok'
      },
    })
    chat.connect()
    await chat.send('one')
    await chat.send('  ')
    await chat.send('two')
    expect(seen[1]).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'two' },
    ])
  })

  it('clear wipes state and storage', async () => {
    const storage = memoryStorage()
    const chat = createChat({ storage, transport: fakeTransport(['a']) })
    chat.connect()
    await chat.send('Q')
    chat.clear()
    expect(chat.getState().messages).toEqual([])
    expect(storage.get('pc:chat')).toBeNull()
  })

  it('warns when an API key is put in client headers', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createChat({ headers: { authorization: 'Bearer sk-ant-abc123456789' } })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not touch window before connect (SSR safe)', () => {
    const spy = vi.spyOn(window, 'addEventListener')
    createChat()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
