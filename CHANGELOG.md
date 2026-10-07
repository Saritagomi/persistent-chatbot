# @gomisarita/persistent-chatbot

## 0.1.0

### Minor Changes

First release.

- **Survives refresh:** chat history in localStorage, sessionStorage, memory or your own adapter. A refresh mid-answer restores the partial text as "interrupted" with Retry. Cross-tab sync.
- **Streaming:** tokens over SSE, batched to one render per animation frame. Stop and retry.
- **Markdown:** built-in streaming-safe, XSS-safe renderer (lists, code blocks with copy, tables, links). No `innerHTML`.
- **Server:** `createChatHandler` for Anthropic, OpenAI or a custom provider. Validation, origin, auth and rate-limit hooks, and generic error codes. The API key never reaches the browser. `toNodeHandler` for Express.
- **UI:** `<Chatbot>` (floating or inline) and the `useChat` hook. Modern design with 8 gradient themes, a Light/Dark/Auto switch (`colorPicker`), suggestion chips, full-screen panel on mobile, keyboard and screen-reader support.
- Zero runtime dependencies, about 10 KB gzip on the client.
