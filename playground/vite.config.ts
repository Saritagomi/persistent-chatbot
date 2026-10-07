import react from '@vitejs/plugin-react'
import type { Plugin, UserConfig } from 'vite'
import { createChatHandler, toNodeHandler } from '../src/server'
import { mockProvider } from './mock-provider'

// Real provider when a key is set in the shell, else mock. The key stays in this Node process.
const { ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_MODEL } = process.env
const systemPrompt = 'You are a helpful assistant. Use markdown when it helps.'
const mode = ANTHROPIC_API_KEY ? 'Claude' : OPENAI_API_KEY ? 'OpenAI' : 'Demo mode · mock AI'
const handler = toNodeHandler(
  ANTHROPIC_API_KEY
    ? createChatHandler({
        provider: 'anthropic',
        apiKey: ANTHROPIC_API_KEY,
        model: 'claude-sonnet-5-5',
        systemPrompt,
      })
    : OPENAI_API_KEY
      ? createChatHandler({
          provider: 'openai',
          apiKey: OPENAI_API_KEY,
          model: OPENAI_MODEL ?? 'gpt-4.1-mini',
          systemPrompt,
        })
      : createChatHandler({ provider: mockProvider, model: 'mock' }),
)

const api = (): Plugin => ({
  name: 'chat-api',
  configureServer(server) {
    server.middlewares.use('/api/chat', (req, res) => {
      req.url = '/api/chat'
      handler(req, res)
    })
  },
})

const config: UserConfig = {
  root: import.meta.dirname,
  plugins: [react(), api()],
  define: { __PC_MODE__: JSON.stringify(mode) },
}
export default config
