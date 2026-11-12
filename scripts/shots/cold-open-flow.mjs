#!/usr/bin/env node
/**
 * Cold open on a slow server, in the real web export with every Supabase call
 * mocked: a returning signed-in viewer whose saved access token has expired
 * (so supabase-js refreshes it first) opens the app while every Supabase
 * response takes `--delay` ms, like a cold Supabase project (2026-11-06: token
 * refresh 2.6 s, then every REST call ~10 s).
 *
 * Visit 1 (fast server) saves what the device keeps; visit 2 (slow server)
 * measures when the Events feed, the viewer's points on Profile, the Chat
 * list and the outside tournaments on Tournaments first show. With the device snapshots they should paint well before the
 * server answers; without them they wait for it.
 *
 *   node scripts/shots/cold-open-flow.mjs --dist dist-mock [--delay 8000] [--out shots/cold-open]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const out = resolve(args.out || 'shots/cold-open')
const delay = Number(args.delay ?? 8000)
await mkdir(out, { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
const report = {}
let browser

/** ms from navigation until `locator` is visible with the splash gone, or null if that never happens within `budget`. */
async function timeUntil(page, start, locator, budget) {
  try {
    await locator.filter({ visible: true }).first().waitFor({ state: 'visible', timeout: budget })
    // The app tree mounts under the splash, so "visible" alone can be hidden behind it.
    await page.getByText('BETA', { exact: true }).waitFor({ state: 'detached', timeout: budget })
    return Date.now() - start
  } catch {
    return null
  }
}

try {
  browser = await launchChromium()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago', locale: 'en-US' })
  const now = defaultNow()
  const page = await context.newPage()
  await installSupabaseMock(page, { now, signedIn: true, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })

  // Visit 1: fast server. Open Events, Profile and Chat so each is saved on the device.
  await page.goto(`${server.url}/`, { waitUntil: 'load' })
  await page.getByTestId('event-card').first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500) // the snapshots are written about a second after the data lands
  await page.goto(`${server.url}/profile`, { waitUntil: 'load' })
  await page.getByTestId('profile-points-count').first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await page.goto(`${server.url}/chat`, { waitUntil: 'load' })
  await page.getByTestId('conversation-row').first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await page.goto(`${server.url}/tournaments`, { waitUntil: 'load' })
  await page.getByTestId('external-program-card').first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)

  // Visit 2: the saved access token has expired and the server is slow.
  // (an init script: the mock's own one rewrites a fresh session on every navigation, and this one runs after it)
  await page.addInitScript(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue
      const s = JSON.parse(localStorage.getItem(key))
      s.expires_at = Math.floor(Date.now() / 1000) - 60
      localStorage.setItem(key, JSON.stringify(s))
    }
  })
  await page.route(url => url.href.includes('.supabase.co/') && !url.href.includes('/realtime/'), async route => {
    if (route.request().method() !== 'OPTIONS') await new Promise(r => setTimeout(r, delay))
    await route.fallback()
  })

  for (const [name, path, target] of [
    ['events', '/', page.getByTestId('event-card')],
    ['profile', '/profile', page.getByTestId('profile-points-count')],
    ['chat', '/chat', page.getByTestId('conversation-row')],
    ['tournaments', '/tournaments', page.getByTestId('external-program-card')],
  ]) {
    const start = Date.now()
    await page.goto(`${server.url}${path}`, { waitUntil: 'commit' })
    // What the viewer sees 1.5 s in (the server hasn't answered yet), then how long until it's really there.
    await page.waitForTimeout(Math.max(0, 1500 - (Date.now() - start)))
    await page.screenshot({ path: `${out}/${name}-at-1.5s.png` }).catch(() => {})
    report[name] = await timeUntil(page, start, target, delay * 3)
  }
  report.serverDelayMs = delay
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await browser?.close()
  await server.close()
}
