import type { ChatMessage } from '../core/types'

export interface ProviderRequest {
  messages: ChatMessage[]
  system?: string
  model: string
  maxTokens: number
  apiKey: string
  baseURL?: string
  /** Aborted when the browser disconnects. Pass it to `fetch`. */
  signal: AbortSignal
}

/** Yields text deltas. Throw `UpstreamError` (or anything) on failure. */
export type Provider = (req: ProviderRequest) => AsyncIterable<string>

export interface ChatHandlerOptions {
  provider: 'anthropic' | 'openai' | Provider
  /** Read from env on the server. Never sent to the client. */
  apiKey?: string
  model: string
  /** Lives only on the server; clients cannot send `system` messages. */
  systemPrompt?: string | ((req: Request) => string | Promise<string>)
  /** Default 1024. */
  maxTokens?: number
  /** Override provider URL (proxies, OpenAI-compatible APIs). */
  baseURL?: string
  limits?: {
    /** Only the last N messages are sent upstream. Default 40. */
    maxMessages?: number
    /** Max characters per user message, else 400. Default 8000. */
    maxChars?: number
    /** Max request body size, else 413. Default 512 KB. */
    maxBodyBytes?: number
  }
  /** Allowed `Origin` headers. Others get 403. Requests without `Origin` pass. */
  allowedOrigins?: string[]
  /** Return false to reject with 401. */
  authorize?: (req: Request) => boolean | Promise<boolean>
  /** Return false to reject with 429. */
  rateLimit?: (req: Request) => boolean | Promise<boolean>
  /** Called after a complete answer. Use for logging, billing, saving to your DB. */
  onFinish?: (event: { messages: ChatMessage[]; text: string; request: Request }) => unknown
  /** Server-side error log. Details here are never sent to the client. */
  onError?: (error: unknown) => void
}
