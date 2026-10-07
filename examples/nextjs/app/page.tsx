// Server component: <Chatbot> ships with "use client", so it works here directly.
import { Chatbot } from '@saritagomi/persistent-chatbot/react'

export default function Page() {
  return (
    <main>
      <h1>Next.js + persistent-chatbot</h1>
      <Chatbot endpoint="/api/chat" title="Assistant" welcomeMessage="Hi! Ask me anything." />
    </main>
  )
}
