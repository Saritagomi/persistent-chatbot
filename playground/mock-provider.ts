import type { Provider } from '../src/server'

const sample = (q: string) => `You asked: **${q.replace(/[*_`]/g, '')}**

This answer comes from the *mock provider* — no API key needed.

## What this shows
1. Tokens stream in word by word
2. Markdown renders while streaming
   - nested list item
   - \`inline code\`
3. Refresh the page: chat is restored

\`\`\`ts
import { Chatbot } from '@saritagomi/persistent-chatbot/react'

export default () => <Chatbot endpoint="/api/chat" />
\`\`\`

| Problem | Fixed |
|:--|:-:|
| Refresh wipes chat | ✅ |
| Raw markdown | ✅ |
| Waits for full answer | ✅ |
| Key in frontend | ✅ |

> Links work too: https://www.npmjs.com and [docs](https://example.com).`

/** Fake LLM: streams a markdown answer word by word. */
export const mockProvider: Provider = async function* ({ messages, signal }) {
  const q = messages[messages.length - 1]?.content ?? ''
  for (const part of sample(q).split(/(?<=\s)/)) {
    if (signal.aborted) return
    await new Promise((r) => setTimeout(r, 25))
    yield part
  }
}
