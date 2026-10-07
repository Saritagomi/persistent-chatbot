import { readSSE } from '../../core/stream'
import type { Provider } from '../types'
import { post } from '../upstream'

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string | null } }>
}

/** OpenAI Chat Completions. Works with compatible APIs via `baseURL`. */
export const openai: Provider = async function* (r) {
  const body = await post(
    `${r.baseURL ?? 'https://api.openai.com/v1'}/chat/completions`,
    { authorization: `Bearer ${r.apiKey}` },
    {
      model: r.model,
      max_completion_tokens: r.maxTokens,
      stream: true,
      messages: r.system ? [{ role: 'system', content: r.system }, ...r.messages] : r.messages,
    },
    r.signal,
  )
  // `data: [DONE]` is not JSON and is skipped by readSSE; stream end finishes the loop.
  for await (const chunk of readSSE(body) as AsyncGenerator<OpenAIChunk>) {
    const text = chunk.choices?.[0]?.delta?.content
    if (text) yield text
  }
}
