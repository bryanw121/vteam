/**
 * Crawler-like browsers (#331). Some crawlers run the web app with analytics
 * on (they aren't `navigator.webdriver`), and in November 2026 every first
 * visit `feed_first_paint` recorded since #326 came from one: one-visit anon
 * sessions with the same handful of events and user agents like "Chrome 117
 * on Windows" or Chrome 125 with a stray "Edge/12.246". This only labels them
 * (`bot: true` on session_start and feed_first_paint) so first-visit numbers
 * can leave them out; nothing is blocked. Pure, so it is unit-tested.
 */

/** Tokens no person's browser sends. */
const BOT_TOKENS = /bot\b|crawler|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|embedly|python-requests|curl\/|wget|phantomjs|puppeteer|playwright/i

/** Chrome ships a major version about every 4 weeks; one 12+ behind current is a frozen crawler build. */
const CHROME_MAX_LAG = 12
/** Chrome 131 was released on 2024-11-12; releases come about every four weeks, with a longer gap
 * over the winter holidays, so 31 days a version keeps the estimate a little low. */
const CHROME_131_RELEASED = Date.UTC(2024, 10, 12)
const CHROME_RELEASE_DAYS = 31

/** The newest Chrome major version that should be out at `now` (an estimate, a little low on purpose). */
export function currentChromeMajor(now: number): number {
  return 131 + Math.floor((now - CHROME_131_RELEASED) / (CHROME_RELEASE_DAYS * 86_400_000))
}

export function isBotAgent(ua: string | null | undefined, now: number = Date.now()): boolean {
  if (!ua) return false
  if (BOT_TOKENS.test(ua)) return true
  // Legacy EdgeHTML ("Edge/12–18") was retired in 2021: next to a Chromium token it's a made-up string.
  if (/\bEdge\/1\d\./.test(ua) && /Chrome\//.test(ua)) return true
  const chrome = /(?:Chrome|CriOS)\/(\d+)\./.exec(ua)
  if (chrome && !/\b(?:Edg|OPR|SamsungBrowser|YaBrowser)\//.test(ua)) {
    if (Number(chrome[1]) < currentChromeMajor(now) - CHROME_MAX_LAG) return true
  }
  return false
}

/** The browser's user agent, or null (native, static render). */
export function browserAgent(): string | null {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' ? navigator.userAgent : null
  } catch {
    return null
  }
}
