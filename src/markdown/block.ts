export type Block =
  | { t: 'code'; lang: string; text: string; open: boolean }
  | { t: 'h'; level: number; text: string }
  | { t: 'hr' }
  | { t: 'quote'; c: Block[] }
  | { t: 'list'; ordered: boolean; start: number; items: Block[][] }
  | {
      t: 'table'
      align: Array<'left' | 'right' | 'center' | undefined>
      head: string[]
      rows: string[][]
    }
  | { t: 'p'; text: string }

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^ {0,3}([-*_])(\s*\1){2,}\s*$/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const QUOTE = /^ {0,3}> ?/
const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

type Kind = 'code' | 'h' | 'hr' | 'quote' | 'list' | 'table' | 'p' | 'blank'

const kind = (line: string): Kind =>
  !line.trim()
    ? 'blank'
    : FENCE.test(line)
      ? 'code'
      : HEADING.test(line)
        ? 'h'
        : HR.test(line)
          ? 'hr'
          : QUOTE.test(line)
            ? 'quote'
            : ITEM.test(line)
              ? 'list'
              : line.trim()[0] === '|'
                ? 'table'
                : 'p'

/**
 * Splits markdown into top-level block sources. Finished blocks keep the same
 * string while text streams in, so renderers can memoize them.
 */
export function splitBlocks(src: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let curKind: Kind = 'blank'
  let fence = ''
  let gap = false
  const flush = () => {
    if (cur.length) out.push(cur.join('\n'))
    cur = []
    curKind = 'blank'
  }
  for (const line of src.split('\n')) {
    if (fence) {
      cur.push(line)
      if (line.trim().startsWith(fence) && !line.trim().slice(fence.length).trim()) {
        fence = ''
        flush()
      }
      continue
    }
    const k = kind(line)
    if (k === 'blank') {
      gap = cur.length > 0
      continue
    }
    // Lists continue over blank lines when the next line is indented or another item.
    const continues =
      curKind === 'list'
        ? /^\s{2,}/.test(line) || k === 'list' || (!gap && k === 'p')
        : !gap &&
          (curKind === 'quote'
            ? k === 'quote' || k === 'p'
            : curKind === 'table'
              ? line.includes('|')
              : curKind === 'p' && k === 'p')
    gap = false
    if (!continues) {
      flush()
      if (k === 'code') fence = (FENCE.exec(line) as RegExpExecArray)[1] as string
      curKind = k
    }
    cur.push(line)
    if (k === 'h' || k === 'hr') flush()
  }
  flush()
  return out
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/(^|[^\\])\|$/, '$1')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))

const parseAll = (src: string): Block[] => splitBlocks(src).map(parseBlock)

/** Parses one block source from `splitBlocks`. */
export function parseBlock(src: string): Block {
  const lines = src.split('\n')
  const first = lines[0] as string
  let m = FENCE.exec(first)
  if (m) {
    const fence = m[1] as string
    const last = lines[lines.length - 1] as string
    const open = lines.length < 2 || !last.trim().startsWith(fence)
    return {
      t: 'code',
      lang: m[2] as string,
      text: lines.slice(1, open ? undefined : -1).join('\n'),
      open,
    }
  }
  m = HEADING.exec(first)
  if (m) return { t: 'h', level: (m[1] as string).length, text: m[2] as string }
  if (HR.test(first)) return { t: 'hr' }
  if (QUOTE.test(first))
    return { t: 'quote', c: parseAll(lines.map((l) => l.replace(QUOTE, '')).join('\n')) }
  m = ITEM.exec(first)
  if (m) {
    const base = (m[1] as string).length
    const items: string[][] = []
    let indent = 0
    for (const line of lines) {
      const im = ITEM.exec(line)
      if (im && (im[1] as string).length <= base + 1) {
        indent = (im[1] as string).length + (im[2] as string).length + 1
        items.push([im[3] as string])
      } else {
        const lead = (/^\s*/.exec(line) as RegExpExecArray)[0].length
        items[items.length - 1]?.push(line.slice(Math.min(lead, indent)))
      }
    }
    return {
      t: 'list',
      ordered: /\d/.test(m[2] as string),
      start: Number.parseInt(m[2] as string, 10) || 1,
      items: items.map((item) => parseAll(item.join('\n'))),
    }
  }
  if (lines.length > 1 && first.includes('|') && DELIM.test(lines[1] as string)) {
    return {
      t: 'table',
      align: cells(lines[1] as string).map((c) =>
        c.endsWith(':')
          ? c.startsWith(':')
            ? 'center'
            : 'right'
          : c.startsWith(':')
            ? 'left'
            : undefined,
      ),
      head: cells(first),
      rows: lines.slice(2).map(cells),
    }
  }
  return { t: 'p', text: lines.map((l) => l.trim()).join('\n') }
}
