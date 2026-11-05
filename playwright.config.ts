import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/user.json')

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  // End the run (and emit the github annotations + HTML report) before the CI
  // job's 20-minute timeout kills it silently. A broken build fails fast
  // instead of retrying every test into the timeout.
  ...(process.env.CI ? { globalTimeout: 13 * 60_000, maxFailures: 8 } : {}),
  reporter: [
    // On CI, also report failures as GitHub annotations (readable on the PR and via the API).
    ...(process.env.CI ? [['github'] as const] : []),
    ['list'],                                    // test names + pass/fail as they run
    ['html', { open: 'never' }],                 // full HTML report saved to playwright-report/
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8081',
    // Expo web runs in a desktop browser context
    ...devices['Desktop Chrome'],
    // Most interactions need force due to React Native Web's pointer-event layering
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',               // saved to test-results/ on failure
    trace: 'on-first-retry',                     // captured on the retry after a flaky failure
    video: 'off',                                // screenshots + traces are sufficient for debugging
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
      retries: 0,
    },
    {
      name: 'auth-check',
      testMatch: '**/auth.verify.ts',
      use: { storageState: AUTH_FILE },
      dependencies: ['setup'],
      retries: 0,
    },
    {
      // No stored session: browsing as a guest (guest.spec.ts and any *.guest.spec.ts).
      name: 'guest',
      testMatch: ['**/guest.spec.ts', '**/*.guest.spec.ts'],
    },
    {
      name: 'chromium',
      testIgnore: ['**/*.setup.ts', '**/auth.verify.ts', '**/guest.spec.ts', '**/*.guest.spec.ts'],
      use: { storageState: AUTH_FILE },
      dependencies: ['auth-check'],
    },
  ],
  // Assumes the Expo dev server is already running (`npx expo start --web`)
  // To auto-start it, uncomment the webServer block below:
  // webServer: {
  //   command: 'npx expo start --web --port 8081',
  //   port: 8081,
  //   reuseExistingServer: true,
  // },
})
