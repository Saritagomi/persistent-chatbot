import { load, save } from './persist'
import { localStorageAdapter, memoryStorage } from './storage'
import { fetchTransport } from './stream'
import type { ErrorCode, Message, StorageAdapter, Transport } from './types'

export interface ChatOptions {
  /** Your server route using `createChatHandler`. Default `/api/chat`. */
  endpoint?: string
  /** Extra request headers (e.g. CSRF token). Never put provider API keys here. */
  headers?: Record<string, string>
  /** Replace HTTP entirely (websocket, your own backend...). */
  transport?: Transport
  /** Default `localStorage`. */
  storage?: StorageAdapter
  /** Use a per-user key in logged-in apps, e.g. `chat:${user.id}`. Default `pc:chat`. */
  storageKey?: string
  /** `false` keeps history in memory only. Default `true`. */
  persist?: boolean
  /** Messages kept in storage. Default 100. */
  maxMessages?: number
  /** Messages sent to the server as context. Default 40. */
  maxContext?: number
  /** Drop stored history older than this many ms. */
  ttl?: number
  onError?: (code: ErrorCode) => void
}

export interface ChatState {
  messages: Message[]
  /** `streaming` while an answer is arriving. */
  status: 'idle' | 'streaming'
  /** `false` until stored history has been read. */
  hydrated: boolean
}

export interface Chat {
  getState(): ChatState
  subscribe(listener: () => void): () => void
  /** Read history and attach page listeners. Returns detach function. Safe to call again. */
  connect(): () => void
  send(text: string): Promise<void>
  /** Regenerate the last answer. */
  retry(): Promise<void>
  stop(): void
  clear(): void
}

const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** Framework-agnostic chat store. SSR safe: touches no browser API until `connect()`. */
export function createChat(options: ChatOptions = {}): Chat {
  const {
    endpoint = '/api/chat',
    headers,
    persist = true,
    storageKey: key = 'pc:chat',
    maxMessages = 100,
    maxContext = 40,
    ttl,
    onError,
  } = options
  if (/\bsk-[\w-]{8,}/.test(JSON.stringify(headers ?? ''))) {
    console.error('[persistent-chatbot] API key in client headers. Keep keys on the server.')
  }
  const transport = options.transport ?? fetchTransport(endpoint, headers)
  const storage = persist ? (options.storage ?? localStorageAdapter()) : memoryStorage()
  const listeners = new Set<() => void>()
  let state: ChatState = { messages: [], status: 'idle', hydrated: false }
  let hydration: Promise<void> | undefined
  let controller: AbortController | undefined
  let pending = ''
  let frame = false
  let timer: ReturnType<typeof setTimeout> | undefined
  // Unsaved changes. Only dirty state is written, so an idle tab never overwrites newer history.
  let dirty = false
  // Set on pagehide: the browser kills the request, which must not be saved as an error.
  let unloading = false

  const set = (patch: Partial<ChatState>) => {
    if (patch.messages) dirty = true
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }
  const patchLast = (patch: Partial<Message>) => {
    const messages = state.messages.slice()
    const last = messages.pop()
    if (last) set({ messages: [...messages, { ...last, ...patch }] })
  }

  const saveNow = () => {
    clearTimeout(timer)
    timer = undefined
    if (!state.hydrated || !dirty) return
    dirty = false
    save(storage, key, state.messages, maxMessages)
  }
  // Throttled while streaming: at most one write per 500 ms.
  const saveSoon = () => {
    timer ??= setTimeout(saveNow, 500)
  }

  const flush = () => {
    frame = false
    if (!pending) return
    const last = state.messages[state.messages.length - 1]
    if (last) patchLast({ content: last.content + pending })
    pending = ''
    saveSoon()
  }
  // One render per animation frame, not per token.
  const schedule = () => {
    if (frame) return
    frame = true
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
    else setTimeout(flush, 16)
  }

  const run = async () => {
    const ctrl = new AbortController()
    controller = ctrl
    const history = state.messages
      .filter((m) => m.content && m.status !== 'streaming')
      .slice(-maxContext)
      .map(({ role, content }) => ({ role, content }))
    set({ status: 'streaming' })
    let patch: Partial<Message> = { status: 'complete' }
    try {
      for await (const delta of transport(history, ctrl.signal)) {
        pending += delta
        schedule()
      }
    } catch (e) {
      const code: ErrorCode = ctrl.signal.aborted
        ? 'aborted'
        : ((e as { code?: ErrorCode }).code ?? 'network_error')
      patch = code === 'aborted' ? { status: 'stopped' } : { status: 'error', error: code }
      if (code !== 'aborted') onError?.(code)
    }
    // Cleared/replaced meanwhile, or page unloading (keep `streaming` in storage -> interrupted).
    if (controller !== ctrl || unloading) return
    flush()
    controller = undefined
    patchLast(patch)
    set({ status: 'idle' })
    saveNow()
  }

  const add = (role: Message['role'], content: string): Message => ({
    id: uid(),
    role,
    content,
    createdAt: Date.now(),
    status: role === 'user' ? 'complete' : 'streaming',
  })

  const reload = async () => {
    set({ messages: await load(storage, key, ttl), hydrated: true })
    dirty = false
  }
  const hydrate = () => {
    hydration ??= reload()
    return hydration
  }

  const onHide = () => {
    flush()
    saveNow()
  }
  const onPageHide = () => {
    onHide()
    unloading = true
  }
  const onPageShow = () => {
    unloading = false
  }
  const onVisibility = () => document.visibilityState === 'hidden' && onHide()
  // Cross-tab sync (localStorage fires `storage` in other tabs).
  const onStorage = (e: StorageEvent) => {
    if (e.key === key && !controller) reload()
  }

  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    connect() {
      hydrate()
      if (typeof window === 'undefined') return () => {}
      window.addEventListener('pagehide', onPageHide)
      window.addEventListener('pageshow', onPageShow)
      window.addEventListener('storage', onStorage)
      document.addEventListener('visibilitychange', onVisibility)
      return () => {
        window.removeEventListener('pagehide', onPageHide)
        window.removeEventListener('pageshow', onPageShow)
        window.removeEventListener('storage', onStorage)
        document.removeEventListener('visibilitychange', onVisibility)
        onHide()
      }
    },
    async send(text) {
      const content = text.trim()
      if (!content || controller) return
      await hydrate()
      set({ messages: [...state.messages, add('user', content), add('assistant', '')] })
      saveNow()
      await run()
    },
    async retry() {
      if (controller) return
      await hydrate()
      const messages = state.messages.slice()
      while (messages[messages.length - 1]?.role === 'assistant') messages.pop()
      if (!messages.length) return
      set({ messages: [...messages, add('assistant', '')] })
      await run()
    },
    stop() {
      controller?.abort()
    },
    clear() {
      const ctrl = controller
      controller = undefined
      ctrl?.abort()
      pending = ''
      clearTimeout(timer)
      timer = undefined
      set({ messages: [], status: 'idle' })
      storage.remove(key)
    },
  }
}
