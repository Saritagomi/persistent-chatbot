import { createChatHandler } from '@saritagomi/persistent-chatbot/server'

// The API key lives only here, on the server.
export const POST = createChatHandler({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  model: 'claude-sonnet-5-5',
  systemPrompt: 'You are a helpful assistant. Answer in markdown.',
})
