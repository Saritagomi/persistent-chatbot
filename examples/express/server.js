import { createChatHandler, toNodeHandler } from '@saritagomi/persistent-chatbot/server'
import express from 'express'

// Uses OpenAI when OPENAI_API_KEY is set, else a demo provider (no key needed).
const demo = async function* ({ messages }) {
  const q = messages.at(-1).content
  for (const word of `You said: **${q}**. Set OPENAI_API_KEY for real answers.`.split(' ')) {
    await new Promise((r) => setTimeout(r, 40))
    yield `${word} `
  }
}

const chat = createChatHandler(
  process.env.OPENAI_API_KEY
    ? {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      }
    : { provider: demo, model: 'demo' },
)

const app = express()
app.post('/api/chat', toNodeHandler(chat))
const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => console.log(`chat API on http://localhost:${port}/api/chat`))
