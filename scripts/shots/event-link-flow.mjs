#!/usr/bin/env node
/**
 * A guest opening a shared event link (#347): `/event/<id>` in the mocked web
 * export, with nothing saved on the device, on the same mid-range phone as
 * first-visit-flow.mjs (4× slower CPU, 150 ms round trip, ~9 Mbps for the
 * compressed scripts, every Supabase response taking `--server` ms).
 *
 * The page's <head> gets the preload tag from `<dist>/event-chunk.json`, the
 * same tag `api/event-page.ts` serves (scripts/event-chunk.mjs writes both), so
 * this times what production sends. It reports, as the median of `--runs`:
 *   joinMs       the Join button on screen (the screen is usable)
 *   chunkStartMs when the event screen's chunk started downloading
 *   chunkEndMs   when it was in
 * and the chunk's raw size (`chunkKB`). `--compare` also measures without the
 * preload, interleaved, for a before/after.
 *
 * Compared with scripts/shots/event-link-budget.json: `joinMs` over budget is
 * measured again and fails if still over. `--update` writes today's numbers
 * (lowering is free; raising one needs a line in the PR saying why).
 *
 *   node scripts/shots/event-link-flow.mjs --dist dist-mock [--runs 5] [--cpu 4] [--server 380] [--compare] [--update] [--out event-link-report]
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'
import { IDS } from './fixtures/index.mjs'

const args = parseArgs(process.argv.slice(2))
const dist = resolve(args.dist || 'dist-mock')
const out = resolve(args.out || 'event-link-report')
const runs = Number(args.runs ?? 5)
const cpu = Number(args.cpu ?? 4)
const serverMs = Number(args.server ?? 380)
const budgetFile = resolve('scripts/shots/event-link-budget.json')
const EVENT_PATH = `/event/${IDS.event.sundaySand}`
await mkdir(out, { recursive: true })

let chunk
try {
  chunk = JSON.parse(await readFile(join(dist, 'event-chunk.json'), 'utf8'))
} catch {
  console.error(`No ${join(dist, 'event-chunk.json')}: run node scripts/event-chunk.mjs --dist ${args.dist || 'dist-mock'} after the export.`)
  process.exit(1)
}
const chunkKB = Math.round((await stat(join(dist, chunk.src))).size / 1024)

const median = values => {
  const v = values.filter(x => typeof x === 'number').sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

async function measureOnce(browser, server, preload) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: TIME_ZONE, locale: 'en-US' })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 40e6 / 8, uploadThroughput: 1.5e6 / 8 })
    await installSupabaseMock(page, { now: defaultNow(), signedIn: false, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
    await page.route(u => u.href.includes('.supabase.co/'), async route => {
      if (route.request().method() !== 'OPTIONS') await new Promise(r => setTimeout(r, serverMs))
      await route.fallback()
    })
    // What api/event-page.ts does on Vercel: the export's page with the tag in its <head>.
    if (preload) {
      await page.route(u => u.pathname === EVENT_PATH, async route => {
        const res = await route.fetch()
        // Right after <meta charset>, where api/event-page.ts's injectHeadTags puts its tags,
        // ahead of the app's own scripts.
        const html = (await res.text()).replace(/<meta\s+charset=[^>]*>/i, m => m + chunk.tag)
        await route.fulfill({ response: res, body: html })
      })
    }
    const t0 = Date.now()
    await page.goto(`${server.url}${EVENT_PATH}`, { waitUntil: 'commit' })
    await page.getByText('Join event', { exact: true }).first().waitFor({ timeout: 60_000 })
    const joinMs = Date.now() - t0
    const timing = await page.evaluate(src => {
      const e = performance.getEntriesByType('resource').find(r => r.name.endsWith(src))
      return e ? { chunkStartMs: Math.round(e.startTime), chunkEndMs: Math.round(e.responseEnd) } : {}
    }, chunk.src)
    return { joinMs, ...timing }
  } finally {
    await context.close()
  }
}

async function measure(browser, server, n) {
  const samples = { preload: [], ...(args.compare ? { without: [] } : {}) }
  for (let i = 0; i < n; i++) {
    samples.preload.push(await measureOnce(browser, server, true))
    if (args.compare) samples.without.push(await measureOnce(browser, server, false))
  }
  const keys = ['joinMs', 'chunkStartMs', 'chunkEndMs']
  const sum = list => Object.fromEntries(keys.map(k => [k, median(list.map(s => s[k]))]))
  return { ...sum(samples.preload), ...(args.compare ? { without: sum(samples.without) } : {}), samples }
}

const server = await serveDist(dist)
const browser = await launchChromium()
let measured
const failures = []
try {
  measured = { chunkKB, ...(await measure(browser, server, runs)) }
  let budget = {}
  try { budget = JSON.parse(await readFile(budgetFile, 'utf8')) } catch { /* first run */ }
  if (!args.update && budget.joinMs && measured.joinMs > budget.joinMs) {
    const again = await measure(browser, server, runs)
    if (again.joinMs > budget.joinMs) failures.push(`Join showed at ${again.joinMs} ms (and ${measured.joinMs} ms before that), over the budget of ${budget.joinMs} ms.`)
    else measured = { ...measured, ...again, retried: true }
  }
  if (measured.chunkStartMs != null && measured.chunkStartMs > 500) {
    failures.push(`The event chunk started downloading at ${measured.chunkStartMs} ms: the page's preload didn't take (check event-chunk.json and api/event-page.ts).`)
  }
} finally {
  await browser.close()
  server.close?.()
}

const row = (k, v = measured[k]) => `| ${k} | ${v ?? '–'} |`
const summary = [
  '## Shared event link (guest, mid-range phone)',
  '',
  `${cpu}× CPU, 150 ms round trip, server ${serverMs} ms, median of ${runs}; the page preloads \`${chunk.src.split('/').pop()}\`.`,
  '',
  '| | |',
  '| --- | --- |',
  row('chunkKB'), row('chunkStartMs'), row('chunkEndMs'), row('joinMs'),
  ...(measured.without ? [row('joinMs without preload', measured.without.joinMs), row('chunkStartMs without preload', measured.without.chunkStartMs)] : []),
  '',
  failures.length ? `**Failed:**\n${failures.map(f => `- ${f}`).join('\n')}` : '**Passed.**',
].join('\n')
console.log(summary)
await writeFile(join(out, 'event-link.json'), JSON.stringify(measured, null, 2))
await writeFile(join(out, 'summary.md'), `${summary}\n`)
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, { flag: 'a' })

if (args.update) {
  // A quarter of headroom on the time, as first-visit-flow: CI runners vary.
  await writeFile(budgetFile, `${JSON.stringify({ joinMs: Math.ceil((measured.joinMs * 1.25) / 100) * 100 }, null, 2)}\n`)
  console.log(`Wrote ${budgetFile}`)
}
process.exit(failures.length ? 1 : 0)
