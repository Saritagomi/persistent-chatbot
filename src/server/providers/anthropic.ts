import { readSSE } from '../../core/stream'
import type { Provider } from '../types'
import { post, UpstreamError } from '../upstream'

interface AnthropicEvent {
  type: string
  delta?: { type: string; text?: string }
  error?: { type: string; message: string }
}

export const anthropic: Provider = async function* (r) {
  const body = await post(
    `${r.baseURL ?? 'https://api.anthropic.com'}/v1/messages`,
    { 'x-api-key': r.apiKey, 'anthropic-version': '2023-06-01' },
    {
      model: r.model,
      max_tokens: r.maxTokens,
      messages: r.messages,
      stream: true,
      ...(r.system ? { system: r.system } : {}),
    },
    r.signal,
  )
  for await (const ev of readSSE(body) as AsyncGenerator<AnthropicEvent>) {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
      yield ev.delta.text
    } else if (ev.type === 'error') {
      throw new UpstreamError(ev.error?.type === 'rate_limit_error' ? 429 : 502, JSON.stringify(ev))
    } else if (ev.type === 'message_stop') return
  }
}
