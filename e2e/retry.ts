/**
 * Retries for network flakes, and only for them (#12).
 *
 * CI runners intermittently fail a Supabase request with `TypeError: Failed to
 * fetch` (browser) or `fetch failed` (Node). One of those shouldn't turn the
 * whole gate red, but an assertion failure, an RLS error or a 4xx must still
 * fail on the first try, so every helper here retries only when it saw a
 * network-level failure and rethrows everything else unchanged.
 */
import type { Locator, Page } from '@playwright/test'

const FLAKE = /Failed to fetch|fetch failed|NetworkError|Load failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|upstream connect error|\b50[234]\b/i

/** True for errors that look like the network, not the app. */
export function isNetworkFlake(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}` : String(error)
  return FLAKE.test(msg)
}

type RetryOptions = { attempts?: number; delayMs?: number; label?: string }

/**
 * Run `fn`, retrying up to `attempts` times in total when it throws a network
 * flake (Supabase calls from fixtures and API tests). Supabase-js returns
 * `{ error }` instead of throwing: throw it inside `fn` to opt in.
 */
export async function withNetworkRetry<T>(fn: () => Promise<T>, { attempts = 3, delayMs = 1000, label = 'request' }: RetryOptions = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= attempts || !isNetworkFlake(error)) throw error
      console.warn(`[e2e retry] ${label}: network flake on attempt ${attempt}/${attempts}, retrying: ${error instanceof Error ? error.message : error}`)
      await new Promise(r => setTimeout(r, delayMs * attempt))
    }
  }
}

/**
 * Open `url` and wait for `ready`. If it doesn't appear and the page logged a
 * failed Supabase fetch while loading, reload and try again (up to `attempts`
 * loads). Without a network failure the original timeout is rethrown, so a
 * genuinely broken screen still fails on the first load.
 */
export async function gotoReady(page: Page, url: string, ready: Locator, { timeout = 20_000, attempts = 2 }: { timeout?: number; attempts?: number } = {}): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    let sawFlake = false
    const onConsole = (msg: { type(): string; text(): string }) => { if (msg.type() === 'error' && FLAKE.test(msg.text())) sawFlake = true }
    const onFailed = (req: { url(): string }) => { if (req.url().includes('.supabase.co')) sawFlake = true }
    page.on('console', onConsole)
    page.on('requestfailed', onFailed)
    try {
      if (attempt === 1) await page.goto(url)
      else await page.reload()
      await ready.waitFor({ state: 'visible', timeout })
      return
    } catch (error) {
      if (attempt >= attempts || !sawFlake) throw error
      console.warn(`[e2e retry] ${url}: a Supabase request failed while loading (attempt ${attempt}/${attempts}), reloading`)
    } finally {
      page.off('console', onConsole)
      page.off('requestfailed', onFailed)
    }
  }
}
