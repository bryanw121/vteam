import { expect, type Page, type Request, type Response } from '@playwright/test'

import { E2E_BASE_URL as BASE_URL, e2eCredentials } from './env'

const MAX_LOGIN_ATTEMPTS = 3

function isAuthRequest(urlString: string): boolean {
  const url = new URL(urlString)
  return url.pathname.startsWith('/auth/v1/') || url.pathname.includes('/functions/v1/login-with-username')
}

function responseLabel(response: Response): string | null {
  const url = new URL(response.url())
  if (!isAuthRequest(response.url())) return null
  return `${response.request().method()} ${url.pathname} -> ${response.status()}`
}

function failureLabel(request: Request): string | null {
  if (!isAuthRequest(request.url())) return null
  const url = new URL(request.url())
  return `${request.method()} ${url.pathname} -> ${request.failure()?.errorText ?? 'request failed'}`
}

/**
 * Sign the shared e2e account in once, with bounded retries for transient
 * Supabase failures. The resulting browser storage is saved by auth.setup.ts
 * and reused by every spec instead of making dozens of password-auth calls.
 */
export async function loginForE2E(page: Page): Promise<void> {
  const networkLog: string[] = []
  const onResponse = (response: Response) => {
    const label = responseLabel(response)
    if (label) networkLog.push(label)
  }
  const onRequestFailed = (request: Request) => {
    const label = failureLabel(request)
    if (label) networkLog.push(label)
  }
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)

  let lastError = 'unknown error'
  try {
    for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt += 1) {
      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })

        // A valid session may redirect away from /login before the form mounts.
        if (new URL(page.url()).pathname !== '/') {
          const identifier = page.getByPlaceholder('you@example.com or yourname')
          const password = page.getByPlaceholder('••••••••')
          await expect(identifier).toBeVisible({ timeout: 15_000 })
          const creds = e2eCredentials()
          await identifier.fill(creds.username)
          await password.fill(creds.password)
          // React Native Web's TouchableOpacity does not consistently expose a
          // button role in the static export, so key this action on its exact
          // visible label (the same contract the existing suites used).
          await page.getByText('Sign in', { exact: true }).click()
        }

        // Poll the SPA route instead of waiting for a full-page `load` event.
        // Expo Router changes history after Supabase emits SIGNED_IN, and an
        // ordinary waitForURL can spend the whole test timeout waiting for a
        // navigation lifecycle that never occurs.
        await expect.poll(
          () => new URL(page.url()).pathname,
          {
            message: `login attempt ${attempt} did not leave /login`,
            timeout: 15_000,
            intervals: [250, 500, 1_000],
          },
        ).toBe('/')
        await expect(page.getByText('Events', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt < MAX_LOGIN_ATTEMPTS) {
          console.warn(`e2e login attempt ${attempt}/${MAX_LOGIN_ATTEMPTS} failed; retrying`)
          await page.waitForTimeout(attempt * 1_000)
        }
      }
    }
  } finally {
    page.off('response', onResponse)
    page.off('requestfailed', onRequestFailed)
  }

  const diagnostics = networkLog.length > 0 ? networkLog.join(', ') : 'no auth responses observed'
  throw new Error(
    `Unable to authenticate the e2e account after ${MAX_LOGIN_ATTEMPTS} attempts. ` +
    `Last error: ${lastError}. Auth requests: ${diagnostics}`,
  )
}
