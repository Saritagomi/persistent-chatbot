# Wire protocol

Contract between `createChatHandler` (server) and the client stream reader. Types live in `src/core/types.ts`.

## Request

```
POST <endpoint>
Content-Type: application/json

{ "messages": [ { "role": "user", "content": "Hi" }, ... ] }
```

Rules enforced by the server:
- `role` must be `user` or `assistant`. Anything else (e.g. `system`) is rejected with `bad_request`.
- Last message must be `user`.
- Message count and total characters are capped (configurable).
- No API key, model or system prompt is ever accepted from the client.

## Response

`200 OK`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`.

Each event is one line `data: <json>` followed by a blank line:

```
data: {"t":"d","v":"Hello"}

data: {"t":"d","v":" world"}

data: {"t":"x"}

```

| `t` | Meaning | `v` |
|---|---|---|
| `d` | delta text, append to answer | string |
| `e` | error, stream ends | `ErrorCode` |
| `x` | done, stream ends | — |

Errors detected before streaming starts (validation, auth, rate limit) return a normal JSON response instead:

```
HTTP 400 | 401 | 403 | 413 | 429
{ "error": "<ErrorCode>" }
```

## Client rules

- Chunks may split anywhere, including mid-line and mid-UTF-8 character. Buffer until `\n\n`.
- Unknown `t` values are ignored (forward compatibility).
- Lines not starting with `data:` (comments, keep-alive `:`) are ignored.
- Stream closing without `x` or `e` means `network_error`.
