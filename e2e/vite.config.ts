import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Plugin, UserConfig } from 'vite'
import { createChatHandler, toNodeHandler, UpstreamError } from '../dist/server/index.js'

export const FAKE_KEY = 'sk-e2e-SECRET-0123456789'
const dist = fileURLToPath(new URL('../dist/', import.meta.url))

// Scripted provider: behaviour depends on the user's message.
const handler = toNodeHandler(
  createChatHandler({
    apiKey: FAKE_KEY,
    model: 'e2e',
    onError: () => {},
    provider: async function* ({ messages, apiKey, signal }) {
      if (apiKey !== FAKE_KEY) throw new Error('key not passed')
      const q = messages[messages.length - 1]?.content ?? ''
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      if (q === 'fail') throw new UpstreamError(500, `boom ${apiKey}`)
      if (q === 'xss') {
        yield '<script>window.__xss=1</script><img src=x onerror="window.__xss=1"> '
        yield '[click](javascript:window.__xss=1) done'
        return
      }
      const slow = q === 'slow'
      const parts = [
        'Reply to ',
        `**${q}**`,
        '\n\n```js\nconst x = 1\n```\n\n',
        '| a | b |\n|--|--|\n| 1 | 2 |',
      ]
      for (let i = 0; i < (slow ? 200 : 1); i++) {
        for (const p of parts) {
          if (signal.aborted) return
          await wait(slow ? 30 : 5)
          yield p
        }
        if (slow) yield `\n\nchunk ${i} `
      }
    },
  }),
)

const api = (): Plugin => ({
  name: 'e2e-api',
  configureServer(server) {
    server.middlewares.use('/api/chat', (req, res) => {
      req.url = '/api/chat'
      handler(req, res)
    })
  },
})

const config: UserConfig = {
  root: fileURLToPath(new URL('./app', import.meta.url)),
  plugins: [react(), api()],
  resolve: {
    alias: [
      { find: '@gomisarita/persistent-chatbot/react', replacement: `${dist}react/index.js` },
      { find: '@gomisarita/persistent-chatbot/styles.css', replacement: `${dist}styles.css` },
    ],
  },
  server: { port: 5180, strictPort: true },
  logLevel: 'warn',
}
export default config
