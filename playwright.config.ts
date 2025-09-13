import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 }
  },
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    env: { USE_MOCK_PROVIDER: '1' }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'chromium-real',
      use: { ...devices['Desktop Chrome'] },
      grep: /@real/,
      grepInvert: undefined,
      // Start a separate server without mock for real tests
      webServer: {
        command: 'pnpm dev',
        port: 3000,
        reuseExistingServer: false,
        env: { USE_MOCK_PROVIDER: '0', OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' }
      }
    }
  ]
});


