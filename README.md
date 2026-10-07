# @gomisarita/persistent-chatbot

Drop-in AI chat widget for React that:

- **Survives page refresh.** History is restored from storage, even if you refresh mid-answer.
- **Renders markdown.** Lists, tables, and code blocks render safely, without `innerHTML`.
- **Streams tokens.** Words appear as they are generated, batched to one render per frame.
- **Keeps API keys on the server.** A built-in backend handler holds the key. The client has no `apiKey` option.

Zero runtime dependencies. About 8 KB gzip for the client (core + markdown + React UI + CSS).

## Install

```sh
npm i @gomisarita/persistent-chatbot
```

## 30-second quickstart (Next.js App Router)

**1. Server route** (`app/api/chat/route.ts`). The key stays here:

```ts
import { createChatHandler } from '@gomisarita/persistent-chatbot/server'

export const POST = createChatHandler({
  provider: 'anthropic', // or 'openai', or your own function
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-5-5',
  systemPrompt: 'You are a helpful support bot.',
})
```

**2. Widget** (any client component):

```tsx
'use client'
import { Chatbot } from '@gomisarita/persistent-chatbot/react'
import '@gomisarita/persistent-chatbot/styles.css'

export default function Support() {
  return (
    <Chatbot
      endpoint="/api/chat"
      title="Support"
      welcomeMessage="Hi! How can I help?"
      suggestions={['Track my order', 'Talk to a human']}
      colorPicker
    />
  )
}
```

That's all you need. Refresh the page and the chat is still there.

## `<Chatbot>` props

| Prop | Default | |
|---|---|---|
| `endpoint` | `/api/chat` | Your server route |
| `storageKey` | `pc:chat` | Use a per-user key when users log in, e.g. `` `chat:${user.id}` `` |
| `persist` | `true` | `false` keeps history in memory only |
| `storage` | localStorage | `sessionStorageAdapter()`, `memoryStorage()` or your own `{ get, set, remove }` (sync or async) |
| `maxMessages` | `100` | Messages kept in storage |
| `maxContext` | `40` | Messages sent to the server per request |
| `ttl` | — | Drop stored history older than this many ms |
| `mode` | `floating` | `floating` bubble, or `inline` to fill its parent |
| `defaultOpen` | `false` | Floating mode only |
| `title`, `subtitle`, `placeholder`, `welcomeMessage` | | Text. The subtitle shows "Typing…" while an answer is streaming. |
| `suggestions` | | Starter prompts shown as chips while the chat is empty |
| `avatar` | sparkle icon | Assistant avatar (any `ReactNode`) |
| `theme` | Iris gradient | `{ primary, primaryTo, radius, font }`. Setting `primaryTo` makes the accent a gradient. |
| `colorPicker` | `false` | `true` adds a palette button with 8 gradient themes (Iris, Ocean, Aurora, Sunset, Berry, Flamingo, Midnight, Graphite) and a Light/Dark/Auto switch. The choice is remembered per `storageKey`. Pass `[{ name, color, to? }]` for your own palette (`to` makes it a gradient). |
| `colorScheme` | `auto` | Starting scheme: `light`, `dark`, or `auto` (follows the OS) |
| `headers` | | Extra request headers (CSRF, etc.). Never put API keys here. |
| `transport` | fetch | `(messages, signal) => AsyncIterable<string>` for a custom backend |
| `renderMarkdown` | built-in | `(text) => ReactNode` to use your own renderer |
| `onError` | | `(code) => void` |

The widget is styled with CSS variables (`--pc-primary`, `--pc-radius`, `--pc-font`, `--pc-bg`, `--pc-fg`, …). Dark mode follows `prefers-color-scheme`.

## Headless: build your own UI

```tsx
import { useChat, Markdown } from '@gomisarita/persistent-chatbot/react'

const { messages, status, hydrated, send, stop, retry, clear } = useChat({ endpoint: '/api/chat' })
```

Each message has the shape `{ id, role, content, status, error? }`. The `status` field is one of `streaming | complete | interrupted | stopped | error`.

Without React, use `createChat(options)` from `@gomisarita/persistent-chatbot`. It returns `getState`, `subscribe`, `connect`, `send`, `stop`, `retry`, and `clear`.

## Server: `createChatHandler(options)`

The handler is a Web-standard `(Request) => Promise<Response>` function. It works in Next.js, Hono, Bun, Deno, and Cloudflare Workers.

```ts
createChatHandler({
  provider: 'anthropic' | 'openai' | customProvider,
  apiKey, model, systemPrompt, // systemPrompt can be (req) => string
  maxTokens: 1024,
  baseURL,                     // proxies / OpenAI-compatible APIs
  limits: { maxMessages: 40, maxChars: 8000, maxBodyBytes: 512 * 1024 },
  allowedOrigins: ['https://acme.com'],
  authorize: async (req) => !!(await getSession(req)),  // false -> 401
  rateLimit: async (req) => limiter.check(ip(req)),     // false -> 429
  onFinish: ({ messages, text, request }) => saveToDb(messages, text),
  onError: (err) => log(err),  // server-only; client sees generic codes
})
```

**Express / node:http:**

```js
import express from 'express'
import { createChatHandler, toNodeHandler } from '@gomisarita/persistent-chatbot/server'

const app = express()
app.post('/api/chat', toNodeHandler(createChatHandler({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4.1-mini' })))
```

**Custom provider:**

```ts
const myProvider = async function* ({ messages, system, signal }) {
  yield 'Hello '
  yield 'world'
}
```

### Security built in

- The client cannot send `system` messages. Only `user` and `assistant` roles are accepted, and only `role` and `content` are forwarded.
- Message size, history length, and request body size are capped.
- Provider errors are mapped to generic codes (`upstream_error`, `rate_limited`, …). Error bodies and keys never reach the client.
- Markdown output is React elements only. Raw HTML from the model is shown as text. Links are limited to `http:`, `https:`, and `mailto:`.
- Note: anything in localStorage can be read by any script on your origin. Use `persist={false}` or `sessionStorageAdapter()` for sensitive chats, and call `clear()` on logout.

## Wire protocol

See [docs/protocol.md](./docs/protocol.md) for the event format the client and server use.

## Development

```sh
npm run dev                         # playground with demo AI (no key needed)
ANTHROPIC_API_KEY=... npm run dev   # playground with real Claude
OPENAI_API_KEY=... npm run dev      # playground with real OpenAI
npm test               # unit tests
npm run release:check  # lint, types, tests, build, size, package checks
```

## License

MIT
