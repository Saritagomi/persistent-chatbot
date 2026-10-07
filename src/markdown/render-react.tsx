import { memo, type ReactNode, useState } from 'react'
import { type Block, parseBlock, splitBlocks } from './block'
import { type Inline, parseInline } from './inline'

// Output is React elements only — never innerHTML — so raw HTML in AI output shows as text.
const inline = (nodes: Inline[]): ReactNode[] =>
  nodes.map((n, i) => {
    if (typeof n === 'string') return n
    if (n.t === 'code') return <code key={i}>{n.v}</code>
    if (n.t === 'br') return <br key={i} />
    if (n.t === 'a') {
      return (
        <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
          {inline(n.c)}
        </a>
      )
    }
    const Tag = n.t
    return <Tag key={i}>{inline(n.c)}</Tag>
  })

const text = (s: string): ReactNode[] => inline(parseInline(s))

function CodeBlock({ lang, code }: { lang: string; code: string }): ReactNode {
  const [copied, setCopied] = useState(false)
  return (
    <div className="pc-code">
      <div className="pc-code-bar">
        <span>{lang}</span>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code className={lang ? `language-${lang}` : undefined}>{code}</code>
      </pre>
    </div>
  )
}

const block = (b: Block, i: number): ReactNode => {
  switch (b.t) {
    case 'code':
      return <CodeBlock key={i} lang={b.lang} code={b.text} />
    case 'h': {
      const H = `h${b.level}` as 'h1'
      return <H key={i}>{text(b.text)}</H>
    }
    case 'hr':
      return <hr key={i} />
    case 'quote':
      return <blockquote key={i}>{b.c.map(block)}</blockquote>
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul'
      return (
        <L key={i} start={b.ordered && b.start !== 1 ? b.start : undefined}>
          {b.items.map((item, j) => (
            // Tight item with one paragraph renders without <p>.
            <li key={j}>
              {item.length === 1 && item[0]?.t === 'p' ? text(item[0].text) : item.map(block)}
            </li>
          ))}
        </L>
      )
    }
    case 'table':
      return (
        <div key={i} className="pc-table">
          <table>
            <thead>
              <tr>
                {b.head.map((c, j) => (
                  <th key={j} style={{ textAlign: b.align[j] }}>
                    {text(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, j) => (
                    <td key={j} style={{ textAlign: b.align[j] }}>
                      {text(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return <p key={i}>{text(b.text)}</p>
  }
}

// Finished blocks keep the same source string, so memo skips re-parsing them while streaming.
const MemoBlock = memo(({ src }: { src: string }) => block(parseBlock(src), 0))

/** Streaming-safe, XSS-safe markdown renderer. */
export function Markdown({ text }: { text: string }): ReactNode {
  return splitBlocks(text).map((src, i) => <MemoBlock key={i} src={src} />)
}
