import react from '@vitejs/plugin-react'
import type { Plugin, UserConfig } from 'vite'

// Real provider when a key is set in the shell, else mock. The key stays in this Node process.
const { ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_MODEL } = process.env
const mode = ANTHROPIC_API_KEY ? 'Claude' : OPENAI_API_KEY ? 'OpenAI' : 'Demo mode · mock AI'

const api = (): Plugin => ({
  name: 'chat-api',
  configureServer(server) {
    // Load server code through Vite (TS source, no build step).
    const ready = Promise.all([
      server.ssrLoadModule('/../src/server/index.ts'),
      server.ssrLoadModule('/mock-provider.ts'),
    ]).then(([lib, mock]) => {
      const systemPrompt = 'You are a helpful assistant. Use markdown when it helps.'
      return lib.toNodeHandler(
        ANTHROPIC_API_KEY
          ? lib.createChatHandler({
              provider: 'anthropic',
              apiKey: ANTHROPIC_API_KEY,
              model: 'claude-sonnet-5-5',
              systemPrompt,
            })
          : OPENAI_API_KEY
            ? lib.createChatHandler({
                provider: 'openai',
                apiKey: OPENAI_API_KEY,
                model: OPENAI_MODEL ?? 'gpt-4.1-mini',
                systemPrompt,
              })
            : lib.createChatHandler({ provider: mock.mockProvider, model: 'mock' }),
      )
    })
    server.middlewares.use('/api/chat', async (req, res) => {
      req.url = '/api/chat'
      ;(await ready)(req, res)
    })
  },
})

const config: UserConfig = {
  root: import.meta.dirname,
  plugins: [react(), api()],
  define: { __PC_MODE__: JSON.stringify(mode) },
  server: { fs: { allow: ['..'] } },
}
export default config
