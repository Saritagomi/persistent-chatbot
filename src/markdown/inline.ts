export type Inline =
  | string
  | { t: 'code'; v: string }
  | { t: 'strong' | 'em' | 'del'; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] }
  | { t: 'br' }

/** Only these schemes become links. `javascript:` etc. stay plain text. */
export const safeUrl = (url: string): string | null =>
  /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : null

const AUTOLINK = /^https?:\/\/[^\s<>]*[^\s<>.,:;"')\]!?*_~]/
const WORD = /\w/

/** Finds closing `mark` at/after `from`. Content must not start/end with a space. */
const close = (s: string, mark: string, from: number): number => {
  if (s[from] === ' ' || s[from] === undefined) return -1
  for (let j = s.indexOf(mark, from + 1); j > 0; j = s.indexOf(mark, j + 1)) {
    if (mark.length === 1 && (s[j + 1] === mark || s[j - 1] === mark)) {
      j++
      continue
    }
    if (s[j - 1] !== ' ' && !(mark[0] === '_' && WORD.test(s[j + mark.length] ?? ''))) return j
  }
  return -1
}

/** Inline markdown -> tokens. Unclosed markers stay as text (streaming safe). */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const push = (node: Inline) => {
    if (text) out.push(text)
    text = ''
    out.push(node)
  }
  for (let i = 0; i < s.length; ) {
    const c = s[i] as string
    const rest = s.slice(i)
    if (c === '\\' && /[!-/:-@[-`{-~]/.test(s[i + 1] ?? '')) {
      text += s[i + 1]
      i += 2
      continue
    }
    if (c === '\n') {
      push({ t: 'br' })
      i++
      continue
    }
    if (c === '`') {
      const ticks = (/^`+/.exec(rest) as RegExpExecArray)[0]
      const end = s.indexOf(ticks, i + ticks.length)
      if (end > 0) {
        push({ t: 'code', v: s.slice(i + ticks.length, end) })
        i = end + ticks.length
        continue
      }
      text += ticks
      i += ticks.length
      continue
    }
    if (c === '*' || c === '_' || c === '~') {
      const double = s[i + 1] === c
      const mark = double ? c + c : c
      const intraword = c === '_' && WORD.test(s[i - 1] ?? '')
      const end = (c !== '~' || double) && !intraword ? close(s, mark, i + mark.length) : -1
      if (end > 0) {
        const t = c === '~' ? 'del' : double ? 'strong' : 'em'
        push({ t, c: parseInline(s.slice(i + mark.length, end)) })
        i = end + mark.length
        continue
      }
      text += mark
      i += mark.length
      continue
    }
    if (c === '[') {
      const m =
        /^\[([^\]]*)\]\(\s*<?([^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)>?(?:\s+"[^"]*")?\s*\)/.exec(
          rest,
        )
      if (m) {
        const href = safeUrl(m[2] as string)
        const label = parseInline(m[1] as string)
        if (href) push({ t: 'a', href, c: label })
        else {
          if (text) out.push(text)
          text = ''
          out.push(...label)
        }
        i += m[0].length
        continue
      }
    }
    if (c === 'h' && !WORD.test(s[i - 1] ?? '')) {
      const m = AUTOLINK.exec(rest)
      if (m) {
        push({ t: 'a', href: m[0], c: [m[0]] })
        i += m[0].length
        continue
      }
    }
    text += c
    i++
  }
  if (text) out.push(text)
  return out
}
