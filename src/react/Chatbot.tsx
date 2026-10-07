import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { ChatOptions } from '../core/chat'
import type { Message } from '../core/types'
import { Markdown } from '../markdown/render-react'
import { useChat } from './useChat'

export interface ChatbotProps extends ChatOptions {
  title?: string
  placeholder?: string
  /** Shown when history is empty. Not stored. */
  welcomeMessage?: string
  /** `floating` bubble in the corner (default) or `inline` embed filling its parent. */
  mode?: 'floating' | 'inline'
  /** Floating mode only. Default false. */
  defaultOpen?: boolean
  theme?: { primary?: string; radius?: string; font?: string }
  className?: string
  /** Replace the built-in markdown renderer. */
  renderMarkdown?: (text: string) => ReactNode
}

const NOTE: Partial<Record<Message['status'], string>> = {
  interrupted: 'Interrupted.',
  stopped: 'Stopped.',
  error: 'Something went wrong.',
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d={d} fill="currentColor" />
  </svg>
)

/** Drop-in chat widget. Pair with `@saritagomi/persistent-chatbot/styles.css`. */
export function Chatbot(props: ChatbotProps): ReactNode {
  const {
    title = 'Chat',
    placeholder = 'Type a message…',
    welcomeMessage,
    mode = 'floating',
    defaultOpen = false,
    theme,
    className,
    renderMarkdown = (text: string) => <Markdown text={text} />,
  } = props
  const { messages, status, send, stop, retry, clear } = useChat(props)
  const [open, setOpen] = useState(mode === 'inline' || defaultOpen)
  const [input, setInput] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const atBottom = useRef(true)
  const id = useId()
  const busy = status === 'streaming'
  const floating = mode === 'floating'
  const last = messages[messages.length - 1]

  // Follow new text only when the user is already at the bottom.
  useEffect(() => {
    const el = list.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  })

  const submit = () => {
    if (busy || !input.trim()) return
    atBottom.current = true
    send(input)
    setInput('')
  }
  const close = () => {
    setOpen(false)
    launcher.current?.focus()
  }

  const style = {
    '--pc-primary': theme?.primary,
    '--pc-radius': theme?.radius,
    '--pc-font': theme?.font,
  } as CSSProperties

  return (
    <div className={`pc pc-${mode}${className ? ` ${className}` : ''}`} style={style}>
      {open && (
        <section
          className="pc-panel"
          role={floating ? 'dialog' : 'region'}
          aria-labelledby={id}
          onKeyDown={(e) => {
            if (!floating) return
            if (e.key === 'Escape') return close()
            // Keep Tab focus inside the open floating panel.
            if (e.key !== 'Tab') return
            const items = e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled),textarea,a[href]',
            )
            const edge = items[e.shiftKey ? 0 : items.length - 1]
            if (document.activeElement === edge) {
              e.preventDefault()
              items[e.shiftKey ? items.length - 1 : 0]?.focus()
            }
          }}
        >
          <header className="pc-header">
            <span id={id}>{title}</span>
            <button type="button" onClick={clear} aria-label="New chat" title="New chat">
              <Icon d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
            </button>
            {floating && (
              <button type="button" onClick={close} aria-label="Close">
                <Icon d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />
              </button>
            )}
          </header>
          <div
            className="pc-messages"
            ref={list}
            onScroll={(e) => {
              const el = e.currentTarget
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
          >
            {welcomeMessage && !messages.length && (
              <div className="pc-msg pc-assistant">{renderMarkdown(welcomeMessage)}</div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`pc-msg pc-${m.role} pc-${m.status}`}>
                {m.role === 'user' ? (
                  m.content
                ) : m.status === 'streaming' && !m.content ? (
                  <span className="pc-typing" role="status" aria-label="Typing">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  renderMarkdown(m.content)
                )}
                {NOTE[m.status] && (
                  <div className="pc-note">
                    {NOTE[m.status]}{' '}
                    {m === last && (
                      <button type="button" onClick={retry}>
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Screen readers hear finished answers only, not every token. */}
          <div className="pc-sr" aria-live="polite">
            {last?.role === 'assistant' && last.status === 'complete' ? last.content : ''}
          </div>
          <form
            className="pc-composer"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <textarea
              value={input}
              rows={1}
              placeholder={placeholder}
              aria-label={placeholder}
              // biome-ignore lint/a11y/noAutofocus: panel opened by the user
              autoFocus={floating}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            {busy ? (
              <button type="button" onClick={stop} aria-label="Stop">
                <Icon d="M6 6h12v12H6z" />
              </button>
            ) : (
              <button type="submit" aria-label="Send" disabled={!input.trim()}>
                <Icon d="M3 20.5 21 12 3 3.5v6.6l12 1.9-12 1.9z" />
              </button>
            )}
          </form>
        </section>
      )}
      {floating && (
        <button
          ref={launcher}
          type="button"
          className="pc-launcher"
          aria-expanded={open}
          aria-label={open ? 'Close chat' : 'Open chat'}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Icon
            d={
              open
                ? 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z'
                : 'M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z'
            }
          />
        </button>
      )}
    </div>
  )
}
