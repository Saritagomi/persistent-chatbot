import { createRoot } from 'react-dom/client'
import { Chatbot } from '../src/react'
import '../src/styles.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <>
    <h1>persistent-chatbot playground</h1>
    <p>
      Send a message, refresh mid-answer, refresh after. History stays. Open DevTools → Network: no
      API key anywhere.
    </p>
    <div className="inline-box">
      <Chatbot
        mode="inline"
        title="Inline demo"
        storageKey="pc:inline"
        welcomeMessage="Hi! Ask me anything. Try **refreshing** while I answer."
      />
    </div>
    <Chatbot title="Floating demo" storageKey="pc:floating" theme={{ primary: '#0f766e' }} />
  </>,
)
