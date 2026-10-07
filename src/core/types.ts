/**
 * Shared contract between core, server, markdown and react.
 * Changing anything here affects every track — keep it stable.
 */

export type Role = 'user' | 'assistant'

/**
 * - `streaming`   answer is arriving
 * - `complete`    answer finished normally
 * - `interrupted` page was closed/refreshed mid-stream (set on hydrate)
 * - `stopped`     user pressed stop
 * - `error`       network or server error; `error` field has the code
 */
export type MessageStatus = 'streaming' | 'complete' | 'interrupted' | 'stopped' | 'error'

export interface Message {
  id: string
  role: Role
  content: string
  createdAt: number
  status: MessageStatus
  error?: ErrorCode
}

/** Generic codes sent to the client. Never contain provider details or keys. */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden_origin'
  | 'rate_limited'
  | 'payload_too_large'
  | 'upstream_error'
  | 'network_error'
  | 'aborted'

/** What the client sends and the server/provider receives. */
export interface ChatMessage {
  role: Role
  content: string
}

/** Body the client POSTs to the chat endpoint. */
export interface ChatRequestBody {
  messages: ChatMessage[]
}

/**
 * Server -> client stream events, one JSON object per SSE `data:` line.
 * See docs/protocol.md.
 */
export type StreamEvent =
  | { t: 'd'; v: string } // delta text
  | { t: 'e'; v: ErrorCode } // error, stream ends after this
  | { t: 'x' } // done

/** Pluggable storage. Sync or async; both supported. */
export interface StorageAdapter {
  get(key: string): string | null | Promise<string | null>
  set(key: string, value: string): void | Promise<void>
  remove(key: string): void | Promise<void>
}

/** Shape written to storage. `v` allows future migrations. */
export interface PersistedChat {
  v: 1
  updatedAt: number
  messages: Message[]
}

/**
 * Turns a conversation into a stream of text deltas.
 * Throw an error with a `code: ErrorCode` property to report a specific failure.
 */
export type Transport = (messages: ChatMessage[], signal: AbortSignal) => AsyncIterable<string>
