// Imports the package by name: resolved to the built dist/ (see e2e/vite.config.ts).
import { Chatbot } from '@gomisarita/persistent-chatbot/react'
import '@gomisarita/persistent-chatbot/styles.css'
import { createRoot } from 'react-dom/client'

const mode = new URLSearchParams(location.search).get('mode') === 'floating' ? 'floating' : 'inline'
createRoot(document.getElementById('root') as HTMLElement).render(
  <Chatbot mode={mode} title="E2E" welcomeMessage="Welcome" colorPicker />,
)
