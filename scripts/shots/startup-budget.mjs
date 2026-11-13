#!/usr/bin/env node
/**
 * Startup guard (#225): the first screens must not get slower or send more reads.
 *
 * On the mocked web export (no secrets, no network), for each entry:
 *  - reads: a fresh visit (nothing on the device) records every Supabase read
 *    (GET/HEAD and RPCs; writes and usage metrics are not counted) for 6 s;
 *  - paint: a returning viewer (visit 1 saves the device snapshots) opens the
 *    screen again with an expired token and every Supabase response held
 *    `--delay` ms, and we time how long until the screen's content shows.
 * Results are compared with `scripts/shots/startup-budget.json`:
 *  - more reads than the budget, or a duplicate read not in `allowedDuplicates`,
 *    fails and names the reads that are new;
 *  - paint over budget is measured once more and fails if it is still over.
 * `--update` writes today's numbers as the budget (lowering is free; raising one
 * needs a line in the PR saying why, as with the a11y baseline).
 *
 *   node scripts/shots/startup-budget.mjs --dist dist-mock [--update] [--delay 8000] [--out startup-report]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'
import { compareStartup, describeRequest, duplicates, formatStartupSummary } from './lib/startupBudget.mjs'

const args = parseArgs(process.argv.slice(2))
const delay = Number(args.delay ?? 8000)
const settleMs = Number(args.settle ?? 6000)
const out = resolve(args.out || 'startup-report')
const budgetFile = resolve('scripts/shots/startup-budget.json')

/** name → path, signed in, the element that means "painted". */
export const ENTRIES = [
  { name: 'events', path: '/', signedIn: true, target: 'event-card' },
  { name: 'profile', path: '/profile', signedIn: true, target: 'profile-points-count' },
  { name: 'chat', path: '/chat', signedIn: true, target: 'conversation-row' },
  { name: 'tournaments', path: '/tournaments', signedIn: true, target: 'external-program-card' },
  { name: 'events-guest', path: '/', signedIn: false, target: 'event-card' },
]

const server = await serveDist(resolve(args.dist || 'dist'))
let browser
const measured = {}

const newContext = () => browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago', locale: 'en-US' })
const mock = (page, signedIn) => installSupabaseMock(page, { now: defaultNow(), signedIn, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
const isSupabase = href => href.includes('.supabase.co/') && !href.includes('/realtime/')

async function countReads(entry) {
  const context = await newContext()
  const page = await context.newPage()
  await mock(page, entry.signedIn)
  const seen = []
  page.on('request', request => {
    const href = request.url()
    if (!isSupabase(href) || request.method() === 'OPTIONS' || href.includes('/rest/v1/app_events')) return
    if (!['GET', 'HEAD'].includes(request.method()) && !href.includes('/rpc/')) return
    // The heartbeat is a usage-metrics write sent as an RPC.
    if (href.includes('/rpc/app_heartbeat')) return
    seen.push(describeRequest(request.method(), href))
  })
  await page.goto(`${server.url}${entry.path}`, { waitUntil: 'load' })
  await page.waitForTimeout(settleMs)
  await context.close()
  return seen.sort()
}

/** ms from navigation until the target shows with the splash gone (no screenshot first: that used to add a 1.5 s floor). */
async function timeUntil(page, start, testId, budget) {
  try {
    await page.getByTestId(testId).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: budget })
    await page.getByText('BETA', { exact: true }).waitFor({ state: 'detached', timeout: budget })
    return Date.now() - start
  } catch {
    return null
  }
}

async function measurePaint(entry) {
  const context = await newContext()
  const page = await context.newPage()
  await mock(page, entry.signedIn)
  // Visit 1: fast server; what the device keeps is written about a second after the data lands.
  await page.goto(`${server.url}${entry.path}`, { waitUntil: 'load' })
  await page.getByTestId(entry.target).first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  // Visit 2: the saved token has expired and every Supabase response is slow.
  await page.addInitScript(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue
      const s = JSON.parse(localStorage.getItem(key))
      s.expires_at = Math.floor(Date.now() / 1000) - 60
      localStorage.setItem(key, JSON.stringify(s))
    }
  })
  await page.route(url => isSupabase(url.href), async route => {
    if (route.request().method() !== 'OPTIONS') await new Promise(r => setTimeout(r, delay))
    await route.fallback()
  })
  const start = Date.now()
  await page.goto(`${server.url}${entry.path}`, { waitUntil: 'commit' })
  const ms = await timeUntil(page, start, entry.target, delay * 3)
  await context.close()
  return ms
}

let budget = {}
try { budget = JSON.parse(await readFile(budgetFile, 'utf8')) } catch { /* first run */ }

let result
try {
  browser = await launchChromium()
  for (const entry of ENTRIES) {
    const requestList = await countReads(entry)
    let paintMs = await measurePaint(entry)
    const limit = budget[entry.name]?.paintMs
    if (limit != null && (paintMs == null || paintMs > limit)) paintMs = await measurePaint(entry) // once more before failing
    measured[entry.name] = { paintMs, requests: requestList.length, duplicates: duplicates(requestList), requestList }
  }
} finally {
  await browser?.close()
  await server.close()
}

result = compareStartup(budget, measured)
await mkdir(out, { recursive: true })
await writeFile(`${out}/startup.json`, JSON.stringify({ measured, result }, null, 2))
const summary = formatStartupSummary(measured, result, delay)
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, { flag: 'a' })

if (args.update) {
  const next = {}
  for (const [name, m] of Object.entries(measured)) {
    // Paint gets headroom for slower CI machines; reads are exact.
    next[name] = { paintMs: m.paintMs == null ? null : Math.max(1000, Math.ceil((m.paintMs * 2) / 100) * 100), requests: m.requests, allowedDuplicates: m.duplicates, requestList: m.requestList }
  }
  await writeFile(budgetFile, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Wrote ${budgetFile}`)
} else if (result.failures.length) {
  process.exit(1)
}
