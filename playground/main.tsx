import { createRoot } from 'react-dom/client'
import { Chatbot } from '../src/react'
import '../src/styles.css'
import './playground.css'

const suggestions = [
  'Write a debounce function in JavaScript',
  'Compare React vs Vue',
  'How do I deploy to Vercel?',
  'Give me a long answer',
]

createRoot(document.getElementById('root') as HTMLElement).render(
  <div className="pg">
    <header className="pg-hero">
      <span className="pg-badge">{__PC_MODE__}</span>
      <h1>persistent-chatbot</h1>
      <p>
        Send a message, refresh mid-answer, refresh after. History stays. Open DevTools → Network:
        no API key anywhere.
      </p>
    </header>
    <div className="pg-inline">
      <Chatbot
        mode="inline"
        title="Inline assistant"
        subtitle={__PC_MODE__}
        storageKey="pc:inline"
        welcomeMessage="Hi! I'm a demo assistant. Ask me anything, or pick a suggestion below."
        suggestions={suggestions}
      />
    </div>
    <Chatbot
      title="Support"
      subtitle="Usually replies instantly"
      storageKey="pc:floating"
      welcomeMessage="Hey 👋 How can I help today?"
      suggestions={suggestions.slice(0, 2)}
      theme={{ primary: '#0d9488' }}
    />
  </div>,
)
