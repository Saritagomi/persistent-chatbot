import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { ChatOptions } from '../core/chat'
import type { Message } from '../core/types'
import { Markdown } from '../markdown/render-react'
import { useChat } from './useChat'

export interface ChatbotProps extends ChatOptions {
  title?: string
  /** Small line under the title. Shows "Typing…" while answering. */
  subtitle?: string
  placeholder?: string
  /** Shown when history is empty. Not stored. */
  welcomeMessage?: string
  /** Starter prompts shown as chips when history is empty. */
  suggestions?: string[]
  /** Assistant avatar. Default: sparkle icon. */
  avatar?: ReactNode
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
  interrupted: 'Interrupted',
  stopped: 'Stopped',
  error: 'Something went wrong',
}

const Icon = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d={d} fill="currentColor" />
  </svg>
)

const SPARKLE =
  'M12 2.5c.4 3.9 1.5 5.9 3.2 7.1 1.3.9 3.1 1.4 6.3 1.9v1c-3.2.5-5 1-6.3 1.9-1.7 1.2-2.8 3.2-3.2 7.1h-1c-.4-3.9-1.5-5.9-3.2-7.1-1.3-.9-3.1-1.4-6.3-1.9v-1c3.2-.5 5-1 6.3-1.9C9.5 8.4 10.6 6.4 11 2.5z'

/** Drop-in chat widget. Pair with `@gomisarita/persistent-chatbot/styles.css`. */
export function Chatbot(props: ChatbotProps): ReactNode {
  const {
    title = 'Assistant',
    subtitle,
    placeholder = 'Message…',
    welcomeMessage,
    suggestions,
    avatar = <Icon d={SPARKLE} size={16} />,
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
  const avatarEl = <span className="pc-avatar">{avatar}</span>

  // Follow new text only when the user is already at the bottom.
  useEffect(() => {
    const el = list.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  })

  const submit = (text = input) => {
    if (busy || !text.trim()) return
    atBottom.current = true
    send(text)
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
            {avatarEl}
            <div className="pc-title">
              <strong id={id}>{title}</strong>
              {(busy || subtitle) && <small>{busy ? 'Typing…' : subtitle}</small>}
            </div>
            <button
              type="button"
              className="pc-icon"
              onClick={clear}
              aria-label="New chat"
              title="New chat"
            >
              <Icon d="M4 20v-3.6L15.6 4.8a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L7.6 20zm2-2h.8L15 9.8l-.8-.8L6 17.2z" />
            </button>
            {floating && (
              <button type="button" className="pc-icon" onClick={close} aria-label="Close">
                <Icon d="M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z" />
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
            {!messages.length && welcomeMessage && (
              <div className="pc-row">
                {avatarEl}
                <div className="pc-msg pc-assistant">{renderMarkdown(welcomeMessage)}</div>
              </div>
            )}
            {!messages.length && !!suggestions?.length && (
              <div className="pc-suggestions">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => submit(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`pc-row pc-row-${m.role}`}>
                {m.role === 'assistant' && avatarEl}
                <div className={`pc-msg pc-${m.role} pc-${m.status}`}>
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
                      {NOTE[m.status]}
                      {m === last && (
                        <button type="button" onClick={retry}>
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
              <button type="button" className="pc-send" onClick={stop} aria-label="Stop">
                <Icon d="M7 7h10v10H7z" size={16} />
              </button>
            ) : (
              <button type="submit" className="pc-send" aria-label="Send" disabled={!input.trim()}>
                <Icon d="M11 20V7.8l-5.6 5.6L4 12l8-8 8 8-1.4 1.4L13 7.8V20z" size={18} />
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
            size={26}
            d={
              open
                ? 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z'
                : 'M12 3c5 0 9 3.4 9 7.6s-4 7.6-9 7.6c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.6C4 15 3 12.9 3 10.6 3 6.4 7 3 12 3z'
            }
          />
        </button>
      )}
    </div>
  )
}
