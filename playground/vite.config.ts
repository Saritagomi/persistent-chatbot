import react from '@vitejs/plugin-react'
import type { Plugin, UserConfig } from 'vite'
import { createChatHandler, toNodeHandler } from '../src/server'
import { mockProvider } from './mock-provider'

// Real provider when a key is set in the shell, else mock. The key stays in this Node process.
const handler = toNodeHandler(
  process.env.ANTHROPIC_API_KEY
    ? createChatHandler({
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-sonnet-5-5',
        systemPrompt: 'You are a helpful assistant. Use markdown.',
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

const config: UserConfig = { root: import.meta.dirname, plugins: [react(), api()] }
export default config
