import type { ChatMessage } from '../core/types'

/**
 * Accepts only `{ messages: [{ role: 'user' | 'assistant', content: string }] }`.
 * Copies only role + content, drops empty messages, merges same-role neighbours,
 * keeps the last `maxMessages`. Returns null when invalid.
 */
export function validate(
  body: unknown,
  maxMessages: number,
  maxChars: number,
): ChatMessage[] | null {
  const input = (body as { messages?: unknown } | null)?.messages
  if (!Array.isArray(input) || !input.length) return null
  const out: ChatMessage[] = []
  for (const m of input as Array<Partial<ChatMessage> | null>) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return null
    }
    if (m.role === 'user' && m.content.length > maxChars) return null
    const content = m.content.trim()
    if (!content) continue
    const prev = out[out.length - 1]
    if (prev?.role === m.role) prev.content += `\n\n${content}`
    else out.push({ role: m.role, content })
  }
  const last = out.slice(-maxMessages)
  while (last[0]?.role === 'assistant') last.shift()
  return last[last.length - 1]?.role === 'user' ? last : null
}
