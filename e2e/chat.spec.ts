import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { FAKE_KEY } from './vite.config'

const assistant = (page: Page) => page.locator('.pc-assistant').last()
const send = async (page: Page, text: string) => {
  await page.getByRole('textbox').fill(text)
  await page.getByRole('textbox').press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Welcome')).toBeVisible()
})

test('streams markdown and restores after refresh', async ({ page }) => {
  await send(page, 'hello')
  await expect(assistant(page).locator('strong')).toHaveText('hello')
  await expect(assistant(page).locator('table td').first()).toHaveText('1')
  await expect(assistant(page).locator('.pc-code code')).toHaveText('const x = 1')
  await page.reload()
  await expect(page.locator('.pc-user')).toHaveText('hello')
  await expect(assistant(page).locator('strong')).toHaveText('hello')
  await expect(assistant(page)).toHaveClass(/pc-complete/)
})

test('refresh mid-stream keeps partial answer as interrupted; retry finishes', async ({ page }) => {
  await send(page, 'slow')
  await expect(assistant(page)).toContainText('chunk 2')
  await page.reload()
  await expect(assistant(page)).toHaveClass(/pc-interrupted/)
  await expect(assistant(page)).toContainText('chunk')
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(assistant(page)).toHaveClass(/pc-streaming/)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(assistant(page)).toHaveClass(/pc-stopped/)
  await expect(page.locator('.pc-msg')).toHaveCount(2)
})

test('stop keeps partial text', async ({ page }) => {
  await send(page, 'slow')
  await expect(assistant(page)).toContainText('chunk 0')
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(assistant(page)).toHaveClass(/pc-stopped/)
  await expect(assistant(page)).toContainText('Reply to')
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
})

test('upstream error shows generic message, never key or details', async ({ page }) => {
  const bodies: string[] = []
  page.on('response', async (r) => {
    if (r.url().includes('/api/chat')) bodies.push(await r.text())
  })
  await send(page, 'fail')
  await expect(assistant(page)).toHaveClass(/pc-error/)
  await expect(assistant(page)).toContainText('Something went wrong')
  expect(bodies.join('')).toContain('upstream_error')
  expect(bodies.join('')).not.toContain(FAKE_KEY)
  expect(bodies.join('')).not.toContain('boom')
})

test('API key never reaches the browser', async ({ page }) => {
  const seen: string[] = []
  page.on('request', (r) => seen.push(r.url(), JSON.stringify(r.headers()), r.postData() ?? ''))
  page.on('response', async (r) => {
    try {
      seen.push(await r.text())
    } catch {}
  })
  await page.reload()
  await send(page, 'hello')
  await expect(assistant(page)).toHaveClass(/pc-complete/)
  const storage = await page.evaluate(() => JSON.stringify(localStorage))
  expect([...seen, storage].join('\n')).not.toContain(FAKE_KEY)
})

test('XSS payloads in AI output do not execute', async ({ page }) => {
  let dialog = false
  page.on('dialog', (d) => {
    dialog = true
    d.dismiss()
  })
  await send(page, 'xss')
  await expect(assistant(page)).toContainText('done')
  await assistant(page).getByText('click').click()
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
  expect(dialog).toBe(false)
  await expect(page.locator('.pc-messages script, .pc-messages img')).toHaveCount(0)
  await expect(assistant(page)).toContainText('<script>')
})

test('second tab syncs via storage event', async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto('/')
  await send(page, 'hello')
  await expect(assistant(page)).toHaveClass(/pc-complete/)
  await expect(other.locator('.pc-user')).toHaveText('hello')
})

test('new chat clears history', async ({ page }) => {
  await send(page, 'hello')
  await expect(assistant(page)).toHaveClass(/pc-complete/)
  await page.getByRole('button', { name: 'New chat' }).click()
  await page.reload()
  await expect(page.locator('.pc-user')).toHaveCount(0)
})

test('floating: keyboard only, focus trap, Escape returns focus', async ({ page }) => {
  await page.goto('/?mode=floating')
  const launcher = page.getByRole('button', { name: 'Open chat' })
  await launcher.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'E2E' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('textbox')).toBeFocused()
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open chat' })).toBeFocused()
})

test('a11y: no axe violations (inline + floating, with content)', async ({ page }) => {
  // Measure final colors, not mid fade-in animation.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await send(page, 'hello')
  await expect(assistant(page)).toHaveClass(/pc-complete/)
  const inline = await new AxeBuilder({ page }).include('.pc').analyze()
  expect(inline.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  await page.goto('/?mode=floating')
  await page.getByRole('button', { name: 'Open chat' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).waitFor()
  const floating = await new AxeBuilder({ page }).include('.pc').analyze()
  expect(floating.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
})

test('perf: 500 stored messages render fast; streaming keeps frames flowing', async ({ page }) => {
  await page.evaluate(() => {
    const md = 'Some **bold** text with `code` and a list:\n\n- one\n- two\n\n```js\nlet a = 1\n```'
    const messages = Array.from({ length: 500 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? 'assistant' : 'user',
      content: i % 2 ? md : `question ${i}`,
      createdAt: i,
      status: 'complete',
    }))
    localStorage.setItem('pc:chat', JSON.stringify({ v: 1, updatedAt: Date.now(), messages }))
  })
  // Time from widget mount (empty) to all 500 stored messages rendered.
  await page.addInitScript(() => {
    const w = window as { __t0?: number; __t1?: number }
    new MutationObserver(() => {
      if (!w.__t0 && document.querySelector('.pc')) w.__t0 = performance.now()
      if (!w.__t1 && document.querySelectorAll('.pc-msg').length >= 500) w.__t1 = performance.now()
    }).observe(document, { childList: true, subtree: true })
  })
  await page.reload()
  await expect(page.locator('.pc-msg')).toHaveCount(500)
  const ms = await page.evaluate(() => {
    const w = window as { __t0?: number; __t1?: number }
    return (w.__t1 ?? 0) - (w.__t0 ?? 0)
  })
  console.log(`500-message hydrate render: ${ms.toFixed(1)} ms`)
  expect(ms).toBeGreaterThan(0)
  expect(ms).toBeLessThan(250)

  await page.getByRole('button', { name: 'New chat' }).click()
  await send(page, 'slow')
  await expect(assistant(page)).toContainText('chunk 0')
  const longFrames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let worst = 0
        let last = performance.now()
        const end = last + 2000
        const loop = (now: number) => {
          worst = Math.max(worst, now - last)
          last = now
          if (now < end) requestAnimationFrame(loop)
          else resolve(worst)
        }
        requestAnimationFrame(loop)
      }),
  )
  console.log(`worst frame while streaming: ${longFrames.toFixed(1)} ms`)
  expect(longFrames).toBeLessThan(100)
})

test('color picker: accent + dark mode persist after refresh, accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByRole('button', { name: 'Rose' }).click()
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.getByRole('button', { name: 'Rose' })).toHaveAttribute('aria-pressed', 'true')
  const root = page.locator('.pc')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  const axe = await new AxeBuilder({ page }).include('.pc').analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

  await page.reload()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  expect(await root.evaluate((el) => el.style.getPropertyValue('--pc-primary'))).toBe('#be123c')
  await send(page, 'hello')
  await expect(page.locator('.pc-user')).toHaveCSS('background-color', 'rgb(190, 18, 60)')

  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByRole('button', { name: 'Auto' }).click()
  await expect(root).not.toHaveAttribute('data-theme', /./)
})
