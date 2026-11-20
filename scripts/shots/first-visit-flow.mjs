#!/usr/bin/env node
/**
 * A first visit on a mid-range phone (#331): a guest with nothing saved on the
 * device opens `/` in the mocked web export, on a 4× slower CPU and a 150 ms
 * round trip, with every Supabase response taking `--server` ms (380 by
 * default, live's feed time in November 2026). The download is throttled to
 * what the compressed scripts would take on about 9 Mbps (the export is served
 * uncompressed here).
 *
 * It reports, as the median of `--runs`:
 *   feedReadyMs     the page's own feed request answered (#184)
 *   scriptsMs       the first-load scripts downloaded
 *   appStartMs      the app's first request of its own (it has started)
 *   cardMs          the first event card in the page
 *   paintMs         the splash gone with the card showing
 * and the first-load scripts' raw size (`scriptsKB`).
 *
 * Compared with scripts/shots/first-visit-budget.json: `scriptsKB` over budget
 * fails at once (it's deterministic; the budget has 2% headroom); `cardMs` over budget is measured again
 * and fails if still over. `--update` writes today's numbers (lowering is
 * free; raising one needs a line in the PR saying why).
 *
 *   node scripts/shots/first-visit-flow.mjs --dist dist-mock [--runs 5] [--cpu 4] [--server 380] [--update] [--out first-visit-report]
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const dist = resolve(args.dist || 'dist-mock')
const out = resolve(args.out || 'first-visit-report')
const runs = Number(args.runs ?? 5)
const cpu = Number(args.cpu ?? 4)
const serverMs = Number(args.server ?? 380)
const budgetFile = resolve('scripts/shots/first-visit-budget.json')
await mkdir(out, { recursive: true })

/** Raw size of the scripts index.html loads before the app runs. */
async function firstLoadKB() {
  const html = await readFile(join(dist, 'index.html'), 'utf8')
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(m => m[1])
  let bytes = 0
  for (const s of scripts) bytes += (await stat(join(dist, s))).size
  return Math.round(bytes / 1024)
}

const median = values => {
  const v = values.filter(x => typeof x === 'number').sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

async function measureOnce(browser, server) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: TIME_ZONE, locale: 'en-US' })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    await cdp.send('Network.enable')
    // ~9 Mbps for brotli-sized scripts ≈ 40 Mbps for the uncompressed files served here.
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 40e6 / 8, uploadThroughput: 1.5e6 / 8 })
    await installSupabaseMock(page, { now: defaultNow(), signedIn: false, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
    const requests = []
    const t0 = Date.now()
    await page.route(u => u.href.includes('.supabase.co/'), async route => {
      if (route.request().method() !== 'OPTIONS') {
        const started = Date.now() - t0
        await new Promise(r => setTimeout(r, serverMs))
        requests.push({ path: new URL(route.request().url()).pathname, started, done: Date.now() - t0 })
      }
      await route.fallback()
    })
    await page.goto(`${server.url}/`, { waitUntil: 'commit' })
    const card = page.getByTestId('event-card').filter({ visible: true }).first()
    await card.waitFor({ timeout: 60_000 })
    const cardMs = Date.now() - t0
    // The app tree mounts under the splash: "BETA" leaving is when the card can be seen.
    await page.getByText('BETA', { exact: true }).waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {})
    const paintMs = Date.now() - t0
    const scriptsMs = await page.evaluate(() => Math.round(Math.max(0, ...performance.getEntriesByType('resource')
      .filter(e => e.name.endsWith('.js')).map(e => e.responseEnd))))
    const feed = requests.find(r => r.path.endsWith('/rpc/get_feed_span'))
    const appFirst = requests.find(r => !r.path.endsWith('/rpc/get_feed_span'))
    return { feedReadyMs: feed?.done ?? null, scriptsMs, appStartMs: appFirst?.started ?? null, cardMs, paintMs }
  } finally {
    await context.close()
  }
}

async function measure(browser, server, n) {
  const samples = []
  for (let i = 0; i < n; i++) samples.push(await measureOnce(browser, server))
  const keys = ['feedReadyMs', 'scriptsMs', 'appStartMs', 'cardMs', 'paintMs']
  return { ...Object.fromEntries(keys.map(k => [k, median(samples.map(s => s[k]))])), samples }
}

const server = await serveDist(dist)
const browser = await launchChromium()
let measured
const failures = []
try {
  measured = { scriptsKB: await firstLoadKB(), ...(await measure(browser, server, runs)) }
  let budget = {}
  try { budget = JSON.parse(await readFile(budgetFile, 'utf8')) } catch { /* first run */ }
  if (!args.update) {
    if (budget.scriptsKB && measured.scriptsKB > budget.scriptsKB) {
      failures.push(`First-load scripts are ${measured.scriptsKB} KB raw, over the budget of ${budget.scriptsKB} KB. Run node scripts/entry-deps.mjs --dist <export> --report to see what grew.`)
    }
    if (budget.cardMs && measured.cardMs > budget.cardMs) {
      const again = await measure(browser, server, runs)
      if (again.cardMs > budget.cardMs) failures.push(`The first event card showed at ${again.cardMs} ms (and ${measured.cardMs} ms before that), over the budget of ${budget.cardMs} ms.`)
      else measured = { ...measured, ...again, retried: true }
    }
  }
} finally {
  await browser.close()
  server.close?.()
}

const row = k => `| ${k} | ${measured[k] ?? '–'} |`
const summary = [
  '## First visit (guest, mid-range phone)',
  '',
  `${cpu}× CPU, 150 ms round trip, server ${serverMs} ms, median of ${runs}.`,
  '',
  '| | |',
  '| --- | --- |',
  row('scriptsKB'), row('feedReadyMs'), row('scriptsMs'), row('appStartMs'), row('cardMs'), row('paintMs'),
  '',
  failures.length ? `**Failed:**\n${failures.map(f => `- ${f}`).join('\n')}` : '**Passed.**',
].join('\n')
console.log(summary)
await writeFile(join(out, 'first-visit.json'), JSON.stringify(measured, null, 2))
await writeFile(join(out, 'summary.md'), `${summary}\n`)
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, { flag: 'a' })

if (args.update) {
  // Headroom: 2% on size, so ordinary feature work passes and a library slipping into the
  // first load doesn't; a quarter on the card time, since CI runners vary more than the size.
  const next = { scriptsKB: Math.ceil(measured.scriptsKB * 1.02), cardMs: Math.ceil((measured.cardMs * 1.25) / 100) * 100 }
  await writeFile(budgetFile, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Wrote ${budgetFile}`)
}
process.exit(failures.length ? 1 : 0)
