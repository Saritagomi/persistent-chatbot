import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { memoryStorage } from '../src/core/storage'
import { Chatbot } from '../src/react/Chatbot'
import { fakeTransport, tick } from './helpers'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mount = async (el: React.ReactNode) => {
  const div = document.createElement('div')
  document.body.append(div)
  const root = createRoot(div)
  await act(async () => root.render(el))
  return { div, root }
}

describe('<Chatbot>', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('server renders without touching storage (no hydration mismatch)', () => {
    const out = renderToString(<Chatbot mode="inline" welcomeMessage="Hi **there**" />)
    expect(out).toContain('<strong>there</strong>')
  })

  it('sends, streams markdown, and restores after remount', async () => {
    const storage = memoryStorage()
    const transport = fakeTransport(['Answer ', 'with **bold**'])
    const { div, root } = await mount(
      <Chatbot mode="inline" storage={storage} transport={transport} />,
    )
    const textarea = div.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, 'Question?')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await tick(50)
    })
    expect(div.querySelector('.pc-user')?.textContent).toBe('Question?')
    expect(div.querySelector('.pc-assistant strong')?.textContent).toBe('bold')
    await act(async () => root.unmount())

    const again = await mount(<Chatbot mode="inline" storage={storage} transport={transport} />)
    await act(() => tick())
    expect(again.div.querySelector('.pc-assistant')?.textContent).toBe('Answer with bold')
  })

  it('floating launcher toggles panel', async () => {
    const { div } = await mount(<Chatbot persist={false} transport={fakeTransport([])} />)
    expect(div.querySelector('.pc-panel')).toBeNull()
    await act(async () => (div.querySelector('.pc-launcher') as HTMLButtonElement).click())
    expect(div.querySelector('.pc-panel')).not.toBeNull()
  })
})
