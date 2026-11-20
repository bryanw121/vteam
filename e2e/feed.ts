import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The desktop Events feed shows a busy day's first few games, then "Show N more
 * on <day>" (EventsFeedDesktop). Opens every such day, so a test can look for a
 * game whatever its place in a busy day. Narrow layouts have no such button.
 */
export async function expandFeedDays(page: Page): Promise<void> {
  const buttons = page.getByTestId('events-feed').locator('[data-testid^="feed-day-more-"]')
  const n = await buttons.count()
  for (let i = 0; i < n; i++) {
    const button = buttons.nth(i)
    const text = (await button.textContent().catch(() => '')) ?? ''
    if (text.startsWith('Show ') && !text.startsWith('Show fewer')) await button.click().catch(() => {})
  }
}

/** Waits until `target` (inside the feed) is on screen, opening busy days as the feed fills in. */
export async function expectInFeed(page: Page, target: Locator, timeout = 20_000): Promise<void> {
  await expect.poll(async () => {
    await expandFeedDays(page)
    return target.first().isVisible()
  }, { timeout }).toBe(true)
}
