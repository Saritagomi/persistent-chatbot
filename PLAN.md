# @gomisarita/persistent-chatbot — Build Plan

Drop-in AI chat widget that solves 4 problems together, in a tiny bundle:

| # | Problem in other packages | Our fix |
|---|---|---|
| 1 | Refresh wipes chat | Persistent store (localStorage / IndexedDB / custom), restores instantly, survives mid-stream refresh |
| 2 | Raw markdown text | Built-in tiny streaming-safe markdown renderer (lists, code blocks, tables, links) |
| 3 | Waits for full answer | Token streaming over `fetch` + `ReadableStream`, batched per animation frame |
| 4 | API key leaks in frontend | `/server` entry: backend handler holds key, client never sees it |

Hard goals: **zero runtime dependencies**, **client JS ≤ 12 KB gzip**, tree-shakable, SSR-safe, typed.

## Status (2026-10-07)

| Phase | State |
|---|---|
| 0. Contracts + setup | done |
| 1. Walking skeleton | done |
| 2. Tracks A/B/C (core, server, markdown + UI) | done |
| 3. Harden: e2e, a11y, perf, examples | done: 11 Playwright tests, axe clean, 500 msgs render ~57 ms, streaming 60 fps, Next.js/Vite/Express examples build from tarball |
| 4. Launch | 0.1.0 published 2026-10-07 as `@gomisarita/persistent-chatbot`; pending: demo, posts |

Measured client size (min + brotli): core 1.9 KB, react + core + markdown 5.4 KB, css 2.1 KB = 7.5 KB total.

Open items: real recorded provider fixtures (needs API key once), StackBlitz demo, README GIF.

---

## 1. Architecture — 3 layers, 1 package, subpath exports

```
@gomisarita/persistent-chatbot           -> core (framework-agnostic, headless)
@gomisarita/persistent-chatbot/react     -> <Chatbot/> component + useChat() hook
@gomisarita/persistent-chatbot/server    -> createChatHandler() (Node / Edge / Bun / Deno)
@gomisarita/persistent-chatbot/styles.css-> optional default theme (CSS variables)
```

Why one package with subpaths (not many packages): one install, one version, but user only ships what they import. Server code never lands in the browser bundle.

### Size budget (enforced by `size-limit` in git hooks)

| Entry | Budget (min+gzip) |
|---|---|
| core (store + stream + persist) | ≤ 3 KB |
| markdown renderer | ≤ 3 KB |
| react UI + hook | ≤ 4.5 KB |
| styles.css | ≤ 2.5 KB (modern theme, rebalanced from react) |
| **total client** | **≤ 12 KB** |
| server | no hard budget, but zero deps (uses `fetch`, no provider SDKs) |

Rules that keep it small:
- No dependencies. `react` / `react-dom` are `peerDependencies` (optional for non-React users).
- `"sideEffects": ["*.css"]` so bundlers tree-shake everything else.
- ESM-first build (`tsdown`; tsup is unmaintained since 2025), CJS also shipped for older tooling. Target `es2020`.
- Syntax highlighting NOT in core. Optional plugin loaded with dynamic `import()` only when a code block appears.
- No class hierarchies, no lodash-style helpers, no polyfills.

---

## 2. End-to-end flow

```
 BROWSER                                              YOUR SERVER                     AI PROVIDER
 ───────                                              ───────────                     ───────────
 [page load]
   │ hydrate(): read storage ─► messages[] restored
   │ (if last msg status = "streaming" -> mark "interrupted", show Retry)
   ▼
 user types, presses Enter
   │ store.add(user msg) ─► persist (debounced)
   │ store.add(assistant msg, status "streaming")
   │ POST /api/chat  { messages: [...user/assistant only] }   (no key!)
   ▼ ───────────────────────────────────────────────► createChatHandler()
                                                         1. authorize(req)   (your hook)
                                                         2. validate body: roles, count, length
                                                         3. rateLimit(req)  (your hook)
                                                         4. add systemPrompt + API key (env)
                                                         5. fetch provider, stream=true ──────► OpenAI / Anthropic / custom
                                                         6. normalize provider SSE  ◄───────── delta chunks
                                                            -> our tiny protocol
   ◄─────────────────────────────── stream: delta, delta, ..., done
   │ parser reads chunks (TextDecoder)
   │ append delta to buffer
   │ requestAnimationFrame: flush buffer -> 1 render per frame (not per token)
   │ markdown: re-parse only LAST block, earlier blocks memoized
   │ persist throttled (every ~500 ms + on done + on `pagehide`)
   ▼
 done -> status "complete" -> final persist
 [refresh] -> back to top, chat restored
```

### Wire protocol (server -> client)

Server converts every provider format to one tiny format, so client parser stays ~300 bytes:

```
data: {"t":"d","v":"Hello"}      // delta text
data: {"t":"d","v":" world"}
data: {"t":"e","v":"rate_limited"} // error (never leaks internals or key)
data: {"t":"x"}                  // done
```

SSE format = works through proxies, debuggable in DevTools, also parsable with plain `fetch` (no `EventSource`, because we need POST + abort).

---

## 3. Feature design, per problem

### 3.1 Persistence (problem 1)

```ts
interface StorageAdapter {
  get(key: string): Promise<string | null> | string | null
  set(key: string, value: string): Promise<void> | void
  remove(key: string): Promise<void> | void
}
```

- Adapters: `localStorage` (default), `sessionStorage`, `indexedDB` (separate import, for large histories), `memory`, or user's own (e.g. sync to their DB).
- Stored shape is versioned: `{ v: 1, id, updatedAt, messages }` with migration function for future versions.
- `storageKey` / `sessionId` prop so many chats per site / per user don't collide. Recommend key include user id for logged-in apps.
- Limits: `maxMessages` (default 100), optional `ttl`. On `QuotaExceededError` drop oldest messages, retry, never crash.
- Writes: debounced; during streaming throttled; forced flush on `done` and `pagehide`/`visibilitychange`.
- Refresh mid-stream: message saved with `status: "streaming"`; on load it becomes `"interrupted"` with Retry button (keeps partial text).
- Cross-tab sync: `storage` event (localStorage) / `BroadcastChannel` (IndexedDB). Optional.
- SSR safe: no `window` access at import time. In Next.js render empty first, hydrate in `useEffect` -> no hydration mismatch.
- Privacy: `persist={false}` switch + `clearHistory()` API; doc warning that localStorage is readable by any script on the origin (no secrets there).

### 3.2 Markdown rendering (problem 2)

Own parser instead of `react-markdown` + `remark` + `rehype` (tens of KB). Scope = what LLMs actually output:

- Block: paragraphs, headings, `-`/`*`/`1.` lists (nested), fenced code blocks with language, blockquote, `---`, GFM tables.
- Inline: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, links, autolinks.
- **Streaming-safe**: unclosed ``` fence renders as code block in progress; unclosed `**` renders as text until closed — no flicker / layout jump.
- **XSS-safe by construction**: parser outputs React elements / DOM nodes, never `innerHTML`. Raw HTML in AI output shown as text. Links allowed only `http:`, `https:`, `mailto:`; `rel="noopener noreferrer"`, `target="_blank"`. So no DOMPurify dependency needed.
- Incremental: split by blocks, memoize completed blocks, re-parse only the growing last block -> O(new text) per frame.
- Code blocks: copy button, language label. Highlighting via optional plugin `highlight: (code, lang) => Promise<ReactNode>` (Shiki/Prism lazy loaded by user).
- Escape hatch: `renderMarkdown` prop to plug in user's own renderer.

### 3.3 Streaming (problem 3)

- `fetch` + `response.body.getReader()` + `TextDecoder({stream:true})`, line buffer for chunk boundaries split mid-line.
- `requestAnimationFrame` batching: 50 tokens/sec still = max 60 renders/sec, normally far fewer.
- Stop button = `AbortController`; partial answer kept, status `"stopped"`.
- Retry / regenerate last answer. Network error -> status `"error"`, message kept.
- Auto-scroll only when user already at bottom (don't yank user reading old messages).
- Typing indicator before first token; `aria-live="polite"` region announces only finished messages (screen readers not spammed per token).
- Custom transport option: `transport: (messages, signal) => AsyncIterable<string>` for users with their own backend (websocket, etc.).

### 3.4 Security (problem 4)

Client API **has no `apiKey` prop at all** — impossible to misuse. Client only knows `endpoint="/api/chat"`.

Server:

```ts
// app/api/chat/route.ts (Next.js) — same handler works in Hono, Bun, Deno, Cloudflare
import { createChatHandler } from '@gomisarita/persistent-chatbot/server'

export const POST = createChatHandler({
  provider: 'anthropic',                 // 'openai' | 'anthropic' | custom fn
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-5-5',
  systemPrompt: 'You are support bot for Acme.',
  maxTokens: 1024,
  limits: { maxMessages: 50, maxChars: 8000 },
  allowedOrigins: ['https://acme.com'],
  authorize: async (req) => !!(await getSession(req)),
  rateLimit: async (req) => myLimiter.check(ip(req)),
})
```

- Handler signature `(req: Request) => Promise<Response>` (Web standard). Express/Node adapter: `toNodeHandler(handler)`.
- Validation: only `user`/`assistant` roles accepted -> client cannot inject `system` prompt. Length/count caps -> stop cost abuse.
- System prompt lives only on server.
- Errors: mapped to generic codes (`rate_limited`, `upstream_error`, `bad_request`); provider error body + key never forwarded; key never logged.
- CORS / origin check, request body size cap.
- Hooks: `onFinish({ messages, usage })` for logging / saving to DB / billing.
- No provider SDKs: direct `fetch` to provider REST API -> zero deps, runs on Edge.
- Dev warning: if client code ever detects `sk-`-looking strings in props/config, `console.error` in development.

---

## 4. Public API (draft)

```tsx
import { Chatbot } from '@gomisarita/persistent-chatbot/react'
import '@gomisarita/persistent-chatbot/styles.css'

<Chatbot
  endpoint="/api/chat"
  storageKey={`chat:${user.id}`}
  title="Acme Support"
  placeholder="Ask anything…"
  welcomeMessage="Hi! How can I help?"
  mode="floating"            // 'floating' bubble | 'inline' embed
  theme={{ primary: '#6d28d9' }}
/>
```

Headless for custom UI:

```tsx
const { messages, send, stop, retry, clear, status } = useChat({ endpoint: '/api/chat' })
```

Vanilla JS (no React): `createChat({ endpoint, storage })` from core with `subscribe()`.

Theming: CSS variables (`--pc-primary`, `--pc-radius`, `--pc-font`…), dark mode via `prefers-color-scheme`, `className` / `classNames` per slot, `unstyled` flag.

---

## 5. Project structure

```
persistent-chatbot/
├─ src/
│  ├─ core/
│  │  ├─ store.ts          # message state, subscribe/notify (tiny, no zustand)
│  │  ├─ persist.ts        # hydrate, throttled save, migrations, quota handling
│  │  ├─ storage/          # local.ts, session.ts, indexeddb.ts, memory.ts
│  │  ├─ stream.ts         # fetch + SSE line parser + abort
│  │  ├─ types.ts
│  │  └─ index.ts
│  ├─ markdown/
│  │  ├─ block.ts          # block tokenizer (streaming-aware)
│  │  ├─ inline.ts         # inline tokenizer
│  │  └─ render-react.tsx  # tokens -> React elements (no innerHTML)
│  ├─ react/
│  │  ├─ useChat.ts
│  │  ├─ Chatbot.tsx
│  │  ├─ MessageList.tsx / Message.tsx / Composer.tsx / CodeBlock.tsx
│  │  └─ index.ts
│  ├─ server/
│  │  ├─ handler.ts        # createChatHandler
│  │  ├─ validate.ts
│  │  ├─ providers/        # openai.ts, anthropic.ts (fetch + normalize SSE)
│  │  ├─ node.ts           # toNodeHandler for Express/http
│  │  └─ index.ts
│  └─ styles.css
├─ playground/         # Vite dev app + mock provider (no API key)
├─ examples/  nextjs/  vite-react/  express/
├─ docs/protocol.md     # wire protocol contract
├─ test/      unit (vitest) + e2e (playwright) + fixtures/*.sse (recorded provider streams)
├─ tsdown.config.ts  lefthook.yml  biome.json  package.json  .size-limit.json  tsconfig.json
└─ README.md  CHANGELOG.md  LICENSE
```

`package.json` key parts:

```json
{
  "name": "@gomisarita/persistent-chatbot",
  "type": "module",
  "sideEffects": ["*.css"],
  "exports": {
    ".":            { "types": "./dist/core/index.d.ts",   "import": "./dist/core/index.js",   "require": "./dist/core/index.cjs" },
    "./react":      { "types": "./dist/react/index.d.ts",  "import": "./dist/react/index.js",  "require": "./dist/react/index.cjs" },
    "./server":     { "types": "./dist/server/index.d.ts", "import": "./dist/server/index.js", "require": "./dist/server/index.cjs" },
    "./styles.css": "./dist/styles.css"
  },
  "files": ["dist"],
  "peerDependencies": { "react": ">=18", "react-dom": ">=18" },
  "peerDependenciesMeta": { "react": { "optional": true }, "react-dom": { "optional": true } }
}
```

React UI files get `"use client"` banner so Next.js App Router works.

---

## 6. Optimized build workflow

Old plan built layer by layer (core, then server, then markdown, then UI). Problem: nothing usable until phase 4, integration bugs found late, no real-user feedback until the end. New workflow fixes that with 5 principles:

1. **Contracts first.** Lock types + wire protocol on day 1. Then server, markdown and UI can be built in parallel without blocking each other.
2. **Walking skeleton.** Thinnest end-to-end path (send, stream, plain text, refresh restore, key on server) working in week 1. All 4 problems demo-able early, then deepen.
3. **No API key needed to develop.** Recorded provider streams (fixtures) + mock provider. Fast, free, deterministic tests.
4. **Gates automated from first commit.** Size, types, package exports, XSS suite checked by local git hooks on every commit/push, not at the end. (No GitHub needed; add a remote + CI later if wanted.)
5. **Ship early to `next` tag.** Install real tarball in real apps from week 2; catch packaging bugs (exports, ESM/CJS, `"use client"`) before 1.0.

### 6.1 Workflow at a glance

```
Week 1                 Week 2-3 (parallel tracks)              Week 4               Week 5
┌──────────────┐      ┌─ Track A: core + persistence ─┐      ┌──────────────┐     ┌──────────────┐
│ 0. Contracts │      │                               │      │ 4. Harden    │     │ 5. Launch    │
│ 1. Skeleton  │ ───► ├─ Track B: server + providers ─┤ ───► │  e2e, a11y,  │ ──► │  docs, demo, │
│  (end-to-end │      │                               │      │  perf, size  │     │  0.1.0, post │
│   thin path) │      └─ Track C: markdown + React UI ┘      └──────────────┘     └──────────────┘
└──────────────┘          publish 0.0.x to npm `next` tag every week
```

Solo developer estimate: ~5 weeks to `0.1.0`. Tracks run sequentially if solo but can be split across people or agents with no merge conflicts (separate folders, shared contract).

### 6.2 Phase details

**Phase 0 — Contracts + setup (day 1-2)**
- Repo, `tsup`, `vitest`, `biome`, `size-limit`, `publint`, `attw`, `changesets`, `lefthook` git hooks — all wired before any feature code.
- Write `src/core/types.ts`: `Message`, `MessageStatus` (`streaming | complete | interrupted | stopped | error`), `StorageAdapter`, `ChatHandlerOptions`, wire event types.
- Write `docs/protocol.md`: exact SSE format + error codes.
- Record fixtures: real OpenAI + Anthropic streaming responses saved to `test/fixtures/*.sse` (one-time, with key; never committed with key).
- Reserve npm scope, publish empty `0.0.0` placeholder.
- **Gate:** `npm run release:check` green on empty build; size check runs (budgets set even before code).

**Phase 1 — Walking skeleton (day 3-5)**
- Server: `createChatHandler` with Anthropic only, minimal validation.
- Core: store + stream reader + localStorage persist (simple JSON, no throttle yet).
- UI: bare `useChat` + unstyled list + textarea. Text shown as plain text.
- Playground app (`playground/`, Vite) + mock provider -> `npm run dev` gives full loop with no key.
- **Gate:** manual demo: send, stream, refresh, history back; key not visible in DevTools network tab. Publish `0.0.1` to `next`.

**Phase 2 — Parallel tracks (week 2-3)**

| Track A: core + persistence | Track B: server | Track C: markdown + UI |
|---|---|---|
| throttled + `pagehide` flush | full validation (roles, sizes, body cap) | block + inline tokenizer |
| status lifecycle incl. `interrupted` | OpenAI provider + custom provider fn | streaming-safe partial blocks |
| quota handling, `maxMessages`, ttl | `authorize`, `rateLimit`, `allowedOrigins` | memoized blocks, re-parse last only |
| versioned schema + migrate | generic error mapping, no leak | `<Chatbot/>` floating + inline |
| rAF render batching, abort, retry | `onFinish` hook, `toNodeHandler` | CSS variables theme, dark mode |
| chunk-split fuzz tests | fixture-replay tests per provider | XSS suite + LLM-output fixtures |

Each track owns its own folder (`core/`, `server/`, `markdown/` + `react/`); only `types.ts` is shared and changes need agreement. Publish `0.0.x` to `next` at end of each week.

**Phase 3 — Harden (week 4)**
- Playwright e2e on built tarball (not source): refresh restore, refresh mid-stream, stop, retry, two tabs, XSS.
- a11y: keyboard only, focus trap in floating mode, `aria-live`, axe check in e2e.
- Perf: 500-message history renders < 100 ms; 100 tokens/s stream keeps 60 fps (Chrome trace in e2e).
- Size tuning: inspect with `esbuild --metafile` / `source-map-explorer`, cut until budgets pass with margin.
- Examples: Next.js App Router, Vite React, Express — each built against packed tarball by `release:check`.

**Phase 4 — Launch (week 5)**
- README: 30-second quickstart first, then API. GIF: refresh page, chat still there. Comparison table (verified claims only).
- StackBlitz live demo using mock provider (no key needed to try).
- Publish `0.1.0` (`latest`) from local machine with 2FA. Post: dev.to / Reddit r/reactjs / X / Hacker News "Show HN".
- Collect issues for 2 weeks, then decide 1.0 scope.

### 6.3 MVP scope cut (v0.1 vs later)

Keep v0.1 small = ship faster, smaller bundle, fewer bugs.

| In v0.1 | Deferred to later |
|---|---|
| localStorage + sessionStorage + memory + custom adapter | IndexedDB adapter |
| Anthropic + OpenAI + custom provider fn | more built-in providers |
| headings, lists, code, inline, links, tables | syntax highlight plugin, math |
| React component + `useChat` | vanilla `createChat`, Vue / Svelte / Web Component |
| single conversation | multi-conversation sidebar, file upload |
| cross-tab sync via `storage` event | `BroadcastChannel` sync |

### 6.4 Daily dev loop

```
npm run dev        # watch build + playground + mock provider (no API key)
npm test           # vitest watch: core, server, markdown
npm run size       # size-limit report
npm run e2e        # playwright against packed tarball
npx changeset      # note change for release
```

Repo: https://github.com/Saritagomi/persistent-chatbot. Branch per change -> commit (pre-commit hook: lint + typecheck) -> merge to `main` -> push/release (pre-push hook: full `release:check`) -> `npx changeset version` -> `npm publish --access public` (2FA) -> `git tag`.

### 6.5 Quality gates (local git hooks + `npm run release:check`)

| Gate | Tool | Fails when |
|---|---|---|
| Types | `tsc --noEmit` strict | any error |
| Lint/format | `biome` (one fast tool instead of eslint+prettier) | any error |
| Unit | `vitest` + `happy-dom` | any failure; coverage < 90% on core/server/markdown |
| Stream fuzz | split every fixture at every byte offset | output differs from unsplit |
| Security | XSS + injection suite | any payload executes or key appears in any response |
| E2E | `playwright` on `npm pack` tarball | refresh-restore or stream flows fail |
| Size | `size-limit` (PR comment with diff) | over budget |
| Packaging | `publint` + `@arethetypeswrong/cli` | bad exports / types for ESM, CJS, bundler |
| Release | `changesets` + `npm publish --access public` (provenance only possible later via CI) | — |

Security tests to keep forever: `<script>`, `<img onerror>`, `javascript:` links, `[x](javascript:alert(1))`, system-role injection, oversize body, key absent from all responses/errors.

### 6.6 Locked decisions (don't revisit without new evidence)

- One package, subpath exports.
- Zero runtime deps; React is optional peer.
- Own markdown parser, React elements output, never `innerHTML`.
- Server uses Web `Request`/`Response`; no provider SDKs.
- Client has no `apiKey` option.
- ESM + CJS dual build (drop CJS only if `attw` + user feedback show no need).

---

## 7. Competitive position (honest)

- Vercel AI SDK (`ai`, `useChat`): great streaming + server helpers, but not drop-in UI, no built-in refresh persistence, markdown left to you.
- UI kits (e.g. chatscope, react-chatbot-kit, deep-chat): UI focus; persistence / safe server proxy / streaming-markdown usually missing or DIY.
- **Our pitch**: one install, one component, one server line — all 4 problems solved, under 12 KB, zero deps.

Verify competitor feature/size claims (bundlephobia, their docs) before putting them in README.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Own markdown parser has edge-case bugs | Scope to LLM-common syntax, big fixture test set, `renderMarkdown` escape hatch |
| Provider API formats change | Providers isolated in one file each; custom provider function supported |
| localStorage holds sensitive chats | `persist={false}`, sessionStorage option, per-user keys, clear on logout doc |
| Bundle creep | size-limit gate on every PR |
| Package name taken / scope | Check `npm view @gomisarita/persistent-chatbot`, npm user is `gomisarita`, scope `@gomisarita` |
