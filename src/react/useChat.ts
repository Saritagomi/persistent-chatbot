import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { type Chat, type ChatOptions, type ChatState, createChat } from '../core/chat'

export interface UseChatResult extends ChatState {
  send: Chat['send']
  stop: Chat['stop']
  retry: Chat['retry']
  clear: Chat['clear']
}

const empty: ChatState = { messages: [], status: 'idle', hydrated: false }

/**
 * Headless chat hook. History loads after mount (no SSR hydration mismatch).
 * A new chat is created when `endpoint`, `storageKey` or `persist` change.
 */
export function useChat(options: ChatOptions = {}): UseChatResult {
  const { endpoint, storageKey, persist } = options
  // biome-ignore lint/correctness/useExhaustiveDependencies: recreate only on identity-changing options
  const chat = useMemo(() => createChat(options), [endpoint, storageKey, persist])
  useEffect(() => chat.connect(), [chat])
  const state = useSyncExternalStore(chat.subscribe, chat.getState, () => empty)
  return { ...state, send: chat.send, stop: chat.stop, retry: chat.retry, clear: chat.clear }
}
