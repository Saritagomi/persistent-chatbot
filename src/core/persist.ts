import type { Message, PersistedChat, StorageAdapter } from './types'

const isMessage = (m: Partial<Message> | null): m is Message =>
  !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && !!m.id

/** Upgrade older stored shapes here when `v` changes. Unknown data is discarded. */
const migrate = (data: Partial<PersistedChat> | null): PersistedChat | null =>
  data?.v === 1 && Array.isArray(data.messages) ? (data as PersistedChat) : null

/** Read history. Never throws. Messages left mid-stream become `interrupted`. */
export async function load(storage: StorageAdapter, key: string, ttl?: number): Promise<Message[]> {
  try {
    const raw = await storage.get(key)
    const data = raw ? migrate(JSON.parse(raw)) : null
    if (!data || (ttl && Date.now() - data.updatedAt > ttl)) return []
    return data.messages
      .filter(isMessage)
      .map((m) => (m.status === 'streaming' ? { ...m, status: 'interrupted' } : m))
  } catch {
    return []
  }
}

/** Write history. On quota errors drops oldest messages and retries. Never throws. */
export async function save(
  storage: StorageAdapter,
  key: string,
  messages: Message[],
  max: number,
): Promise<void> {
  let list = messages.slice(-max)
  for (;;) {
    try {
      const data: PersistedChat = { v: 1, updatedAt: Date.now(), messages: list }
      await storage.set(key, JSON.stringify(data))
      return
    } catch {
      if (list.length < 2) return
      list = list.slice(Math.ceil(list.length / 2))
    }
  }
}
