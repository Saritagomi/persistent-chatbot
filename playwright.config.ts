import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5180', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && vite --config e2e/vite.config.ts',
    url: 'http://localhost:5180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
export default config
