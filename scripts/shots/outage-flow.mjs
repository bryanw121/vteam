#!/usr/bin/env node
/**
 * Outage check (#289): what a player sees when vteam's server stops answering,
 * in the real web export with every Supabase call mocked, then hung.
 *
 * On 2026-11-12 every request waited ~90 s before failing, a saved feed gave no
 * hint, and open tabs kept sending requests into the dead server. Now:
 * - a returning viewer keeps the saved feed and sees "vteam isn't answering"
 *   within 17 s (two reads time out at 15 s);
 * - while it's down, the app sends almost nothing (only the backed-off probe);
 * - when the server answers again, the bar goes by itself (Retry probes at once);
 * - a first visit sees the bar and "vteam isn't answering right now" (with Try
 *   again) within 20 s instead of a spinner for 90 s.
 *
 *   node scripts/shots/outage-flow.mjs --dist dist-mock [--out outage-report]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const out = resolve(args.out || 'outage-report')
await mkdir(out, { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
const SUPABASE = /shotsmock\.supabase\.co/
const BAR_WITHIN_MS = 17_000
const STATE_WITHIN_MS = 20_000
const QUIET_WINDOW_MS = 40_000
const MAX_REQUESTS_WHILE_DOWN = 4
const results = []
let browser

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`)
}

async function newPage(signedIn) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: TIME_ZONE, locale: 'en-US' })
  const page = await context.newPage()
  await installSupabaseMock(page, { now: defaultNow(), signedIn, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
  return { context, page }
}

/** Every Supabase request from now on hangs (like the 11-12 outage) until `release()`. */
async function hangSupabase(page) {
  const held = []
  let count = 0
  const handler = route => { count++; held.push(route) }
  await page.route(SUPABASE, handler)
  return {
    count: () => count,
    release: async () => {
      await page.unroute(SUPABASE, handler)
      for (const r of held) await r.fallback().catch(() => {})
    },
  }
}

async function msUntilBar(page, start, budget = 30_000) {
  try {
    await page.getByTestId('server-status-bar').waitFor({ state: 'visible', timeout: budget })
    return Date.now() - start
  } catch {
    return null
  }
}

try {
  browser = await launchChromium()

  // Returning viewer: one good visit saves the feed on the device, then the server hangs.
  {
    const { context, page } = await newPage(true)
    await page.goto(server.url + '/', { waitUntil: 'load' })
    await page.getByTestId('event-card').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(2500) // the device snapshot is written about a second after the data lands
    const hang = await hangSupabase(page)
    const start = Date.now()
    await page.reload({ waitUntil: 'load' })
    const cardShown = await page.getByTestId('event-card').first().waitFor({ timeout: 10_000 }).then(() => true, () => false)
    check('saved feed still shows', cardShown, cardShown ? 'event cards from the device' : 'no event card within 10 s')
    const ms = await msUntilBar(page, start)
    check('bar on a returning visit', ms !== null && ms <= BAR_WITHIN_MS, ms === null ? 'no bar within 30 s' : `${ms} ms (budget ${BAR_WITHIN_MS})`)
    await page.screenshot({ path: join(out, 'returning-down.png') })

    const before = hang.count()
    await page.waitForTimeout(QUIET_WINDOW_MS)
    const sent = hang.count() - before
    check('quiet while down', sent <= MAX_REQUESTS_WHILE_DOWN, `${sent} Supabase requests in ${QUIET_WINDOW_MS / 1000} s (at most ${MAX_REQUESTS_WHILE_DOWN}: the backed-off probe)`)

    // The server answers again: requests still waiting get their answers (only the 60 s hard limit
    // gives up on them), which brings it back by itself; Retry is there for when nothing is waiting.
    await hang.release()
    const retry = page.getByTestId('server-status-retry')
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {})
    const gone = await page.getByTestId('server-status-bar').waitFor({ state: 'detached', timeout: 10_000 }).then(() => true, () => false)
    check('recovers when the server answers', gone, gone ? 'bar gone once the server answers' : 'bar still up 10 s after the server answered')
    await context.close()
  }

  // First visit (guest, nothing saved): no 90-second spinner.
  {
    const { context, page } = await newPage(false)
    await hangSupabase(page)
    const start = Date.now()
    await page.goto(server.url + '/', { waitUntil: 'load' })
    const ms = await msUntilBar(page, start)
    check('bar on a first visit', ms !== null && ms <= BAR_WITHIN_MS, ms === null ? 'no bar within 30 s' : `${ms} ms (budget ${BAR_WITHIN_MS})`)
    const stateMs = await page.getByTestId('screen-state-server-down').filter({ visible: true }).first().waitFor({ timeout: 30_000 }).then(() => Date.now() - start, () => null)
    check('first visit says the server is down', stateMs !== null && stateMs <= STATE_WITHIN_MS, stateMs === null ? 'still a spinner after 30 s' : `${stateMs} ms (budget ${STATE_WITHIN_MS})`)
    await page.screenshot({ path: join(out, 'first-visit-down.png') })
    await context.close()
  }
} finally {
  await browser?.close()
  server.close?.()
}

const failed = results.filter(r => !r.ok)
const summary = [`## Outage check ${failed.length ? `❌ ${failed.length} failed` : '✅ passed'}`, '', '| | Check | Detail |', '|---|---|---|',
  ...results.map(r => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.detail} |`)].join('\n')
await writeFile(join(out, 'summary.md'), summary + '\n')
process.exit(failed.length ? 1 : 0)
