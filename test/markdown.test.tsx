import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseBlock, splitBlocks } from '../src/markdown/block'
import { parseInline } from '../src/markdown/inline'
import { Markdown } from '../src/markdown/render-react'

const html = (md: string) => renderToStaticMarkup(<Markdown text={md} />)

describe('markdown blocks', () => {
  it('splits and parses typical LLM output', () => {
    const md = [
      '# Title',
      'Intro line',
      'Here are steps:',
      '1. First',
      '2. Second',
      '   - nested',
      '',
      '```ts',
      'const a = 1',
      '',
      'const b = 2',
      '```',
      '| a | b |',
      '|:--|--:|',
      '| 1 | 2 |',
      '',
      '> quote',
      '---',
    ].join('\n')
    expect(splitBlocks(md).map((s) => parseBlock(s).t)).toEqual([
      'h',
      'p',
      'list',
      'code',
      'table',
      'quote',
      'hr',
    ])
    const out = html(md)
    expect(out).toContain('<h1>Title</h1>')
    expect(out).toContain('<p>Intro line<br/>Here are steps:</p>')
    expect(out).toContain('<ol><li>First</li><li><p>Second</p><ul><li>nested</li></ul></li></ol>')
    expect(out).toContain('const a = 1\n\nconst b = 2')
    expect(out).toContain('<th style="text-align:left">a</th>')
    expect(out).toContain('<td style="text-align:right">2</td>')
  })

  it('unclosed fence renders as code in progress', () => {
    const b = parseBlock(splitBlocks('```py\nprint(1)\n**not bold**')[0] as string)
    expect(b).toEqual({ t: 'code', lang: 'py', text: 'print(1)\n**not bold**', open: true })
  })

  it('earlier blocks keep identical source while streaming (memo friendly)', () => {
    const full = 'Para one.\n\n- a\n- b\n\nLast para grows'
    const first = splitBlocks(full.slice(0, 20))
    const later = splitBlocks(full)
    expect(later[0]).toBe(first[0])
  })

  it('ordered list start number and loose lists', () => {
    expect(html('3. c\n\n4. d')).toBe('<ol start="3"><li>c</li><li>d</li></ol>')
  })
})

describe('markdown inline', () => {
  it('formats', () => {
    expect(html('**b** *i* _u_ ~~s~~ `c` [l](https://x.com)')).toBe(
      '<p><strong>b</strong> <em>i</em> <em>u</em> <del>s</del> <code>c</code> <a href="https://x.com" target="_blank" rel="noopener noreferrer">l</a></p>',
    )
  })

  it('unclosed markers stay text (streaming)', () => {
    expect(parseInline('so **bold')).toEqual(['so **bold'])
    expect(parseInline('a `code')).toEqual(['a `code'])
  })

  it('does not treat math / snake_case as emphasis', () => {
    expect(parseInline('2 * 3 * 4')).toEqual(['2 * 3 * 4'])
    expect(parseInline('snake_case_name')).toEqual(['snake_case_name'])
  })

  it('autolinks and trims trailing punctuation', () => {
    expect(html('see https://a.com/x.')).toContain('<a href="https://a.com/x" ')
  })
})

describe('XSS suite', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x]( javascript:alert(1))',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
    '[x](vbscript:msgbox(1))',
    '<a href="javascript:alert(1)">x</a>',
    '```\n</code><script>alert(1)</script>\n```',
    '| <svg onload=alert(1)> |\n|--|\n| x |',
    '`<iframe src=javascript:alert(1)>`',
  ]
  it.each(payloads)('%s', (p) => {
    const out = html(p)
    expect(out).not.toMatch(/<(script|img|svg|iframe)/i)
    expect(out).not.toMatch(/href="(?!https?:|mailto:)/i)
  })
})
