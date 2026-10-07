import { Chatbot } from '@gomisarita/persistent-chatbot/react'
import '@gomisarita/persistent-chatbot/styles.css'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')).render(
  <Chatbot
    endpoint="/api/chat"
    title="Assistant"
    welcomeMessage="Hi! Ask me anything."
    defaultOpen
  />,
)
