#!/usr/bin/env node
/**
 * Capture named screens of a web export with every Supabase call mocked.
 *
 *   node scripts/shots/capture.mjs --dist dist --out shots [--screens a,b] [--desktop]
 *                                  [--src .] [--now 2026-10-29T15:00:00Z] [--suffix ""]
 *
 * Writes <out>/<screen><suffix>.png (390x844 @2x), <screen>-desktop<suffix>.png
 * with --desktop (1280x800), and <out>/capture<suffix>.json describing each shot
 * (ready text found, unknown tables/RPCs hit, page errors).
 *
 * The export must be built against the mock project URL:
 *   EXPO_PUBLIC_SUPABASE_URL=https://shotsmock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=shots-mock-anon-key npx expo export -p web
 * (compare.mjs does this for you.)
 *
 * --src is the checkout the export was built from: its types/database.ts gives
 * the foreign keys for embeds and its constants/banners.ts + tours.ts the ids to
 * mark as already seen.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { SCREENS } from './screens.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'

export const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}

export function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { (args._ ??= []).push(a); continue }
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else { args[key] = next; i++ }
  }
  return args
}

/**
 * Chromium for Playwright. Normally the one matching the installed Playwright;
 * when that build isn't on disk (a machine with browsers preinstalled for another
 * Playwright version), the newest headless shell / Chromium under
 * PLAYWRIGHT_BROWSERS_PATH, or SHOTS_CHROMIUM if set.
 */
/** Flags that make rendering repeatable across runs. */
const STABLE_RENDERING = ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars']

export async function launchChromium() {
  const args = STABLE_RENDERING
  if (process.env.SHOTS_CHROMIUM) return chromium.launch({ executablePath: process.env.SHOTS_CHROMIUM, args })
  if (existsSync(chromium.executablePath())) return chromium.launch({ args })
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? '', '.cache', 'ms-playwright')
  const found = existsSync(root) ? readdirSync(root)
    .filter(d => /^chromium(_headless_shell)?-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()) || (a.includes('headless') ? -1 : 1))
    .flatMap(d => [
      join(root, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      join(root, d, 'chrome-linux64', 'chrome'),
      join(root, d, 'chrome-linux', 'chrome'),
    ])
    .find(existsSync) : undefined
  if (!found) return chromium.launch({ args }) // let Playwright explain what is missing
  return chromium.launch({ executablePath: found, args })
}

/** Shortest time from load to shot. */
const MIN_SETTLE_MS = 3000

async function settle(page, pending, quietMs = 400, timeoutMs = 8000) {
  const start = Date.now()
  let quietSince = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (pending.size > 0) quietSince = Date.now()
    else if (Date.now() - quietSince >= quietMs) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r })))
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  }).catch(() => {})
}

async function runAction(page, action) {
  if (action.tap) {
    const byId = page.getByTestId(action.tap).first()
    // `text` is the fallback for older refs that didn't have the testID yet.
    if (action.text && !(await byId.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false))) {
      await page.getByText(action.text, { exact: true }).first().click({ timeout: 5000 })
    } else await byId.click({ timeout: 10000 })
  }
  else if (action.click) await page.getByText(action.click, { exact: false }).first().click({ timeout: 10000 })
  else if (action.scroll) {
    const vp = page.viewportSize()
    await page.mouse.move(vp.width / 2, vp.height / 2)
    await page.mouse.wheel(0, action.scroll)
  } else if (action.wait) await page.waitForTimeout(action.wait)
}

/**
 * Open one screen in a fresh context, wait until it has settled, then call
 * `onReady(page, result)` (the screenshot, or an axe scan) and record what it returns in `result.output`.
 * Errors from loading or from `onReady` land in `result.errors`; they never throw.
 */
export async function visitScreen(browser, baseUrl, name, screen, size, opts, onReady) {
  const result = { screen: name, size, file: null, ready: null, misses: [], errors: [] }
  const context = await browser.newContext({ ...VIEWPORTS[size], locale: 'en-US', timezoneId: TIME_ZONE, reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block' })
  try {
    // Start the page clock at the fixture "now" and let it run (a frozen clock would stall Animated timings).
    await context.clock.install({ time: opts.now })
    const page = await context.newPage()
    const pending = new Set()
    page.on('request', r => pending.add(r))
    page.on('requestfinished', r => pending.delete(r))
    page.on('requestfailed', r => pending.delete(r))
    page.on('pageerror', e => result.errors.push(e.message.split('\n')[0].slice(0, 300)))
    const signedIn = screen.signedIn !== false
    const { misses } = await installSupabaseMock(page, { now: opts.now, signedIn, seenIds: opts.seenIds, relationships: opts.relationships })
    await page.goto(baseUrl + screen.route, { waitUntil: 'load', timeout: 30000 })
    const loadedAt = Date.now()
    if (screen.ready) {
      result.ready = await page.getByText(screen.ready, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)
    } else {
      await page.waitForTimeout(1500)
    }
    await settle(page, pending)
    for (const action of screen.actions ?? []) {
      try { await runAction(page, action); await settle(page, pending) } catch (e) { result.errors.push(`action ${JSON.stringify(action)}: ${e.message.split('\n')[0]}`) }
    }
    // The app defers some reads after startup (chat unread badge at 1.5s, neighbour-tab prefetch at 2s):
    // wait past them so they land in every shot, not in some.
    const rest = MIN_SETTLE_MS - (Date.now() - loadedAt)
    if (rest > 0) await page.waitForTimeout(rest)
    await settle(page, pending)
    result.output = await onReady(page, result)
    result.misses = [...misses]
  } catch (e) {
    result.errors.push(e.message.split('\n')[0])
  } finally {
    await context.close()
  }
  return result
}

/** The screenshot `onReady`: writes <out>/<screen>[-desktop]<suffix>.png. */
function screenshotTo(opts) {
  return async (page, result) => {
    const file = join(opts.out, `${result.screen}${result.size === 'desktop' ? '-desktop' : ''}${opts.suffix}.png`)
    await page.screenshot({ path: file, fullPage: !!SCREENS[result.screen].fullPage, animations: 'disabled', caret: 'hide' })
    result.file = file
  }
}

/**
 * Serve `dist`, open every (screen, size) job in Chromium and call `onReady` on each
 * once it has settled. Results come back in job order (screens as given, mobile before desktop).
 * @param {{ dist: string, screens?: string[], sizes: string[], src?: string, now?: Date, concurrency?: number, label?: string }} o
 * @param {(page: import('playwright').Page, result: object) => Promise<any>} onReady
 */
export async function visitScreens(o, onReady) {
  const dist = resolve(o.dist)
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`No web export at ${dist} (index.html missing)`)
  const names = o.screens?.length ? o.screens : Object.keys(SCREENS)
  const unknown = names.filter(n => !SCREENS[n])
  if (unknown.length) throw new Error(`Unknown screen(s): ${unknown.join(', ')}. Known: ${Object.keys(SCREENS).join(', ')}`)
  const src = resolve(o.src ?? process.cwd())
  const opts = { now: o.now ?? defaultNow(), relationships: loadRelationships(src), seenIds: loadSeenIds(src) }
  const server = await serveDist(dist)
  const browser = await launchChromium()
  const jobs = names.flatMap(n => o.sizes.map(size => [n, size]))
  const results = []
  try {
    const concurrency = o.concurrency ?? 4
    let next = 0
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [name, size] = jobs[next++]
        const r = await visitScreen(browser, server.url, name, SCREENS[name], size, opts, onReady)
        results.push(r)
        const flag = r.errors.length ? ' (errors)' : r.ready === false ? ' (ready text not found)' : ''
        process.stderr.write(`  ${o.label ?? 'shot'} ${name}${size === 'desktop' ? ' desktop' : ''}${flag}\n`)
      }
    }))
  } finally {
    await browser.close()
    await server.close()
  }
  const order = new Map(jobs.map(([n, s], i) => [`${n}|${s}`, i]))
  results.sort((a, b) => order.get(`${a.screen}|${a.size}`) - order.get(`${b.screen}|${b.size}`))
  return { results, now: opts.now }
}

/**
 * Capture `screens` (names) from `dist` into `out`. Returns one result per shot.
 * @param {{ dist: string, out: string, screens?: string[], desktop?: boolean, src?: string, now?: Date, suffix?: string, concurrency?: number }} o
 */
export async function capture(o) {
  const suffix = o.suffix ?? ''
  const now = o.now ?? defaultNow()
  if (!existsSync(join(resolve(o.dist), 'index.html'))) throw new Error(`No web export at ${resolve(o.dist)} (index.html missing)`)
  await mkdir(o.out, { recursive: true })
  const { results } = await visitScreens(
    { dist: o.dist, screens: o.screens, sizes: o.desktop ? ['mobile', 'desktop'] : ['mobile'], src: o.src, now, concurrency: o.concurrency },
    screenshotTo({ out: o.out, suffix }),
  )
  for (const r of results) delete r.output
  await writeFile(join(o.out, `capture${suffix}.json`), JSON.stringify({ now: now.toISOString(), results }, null, 2))
  return results
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('node scripts/shots/capture.mjs --dist dist --out shots [--screens a,b] [--desktop] [--src .] [--now ISO] [--suffix s]')
    console.log('Screens:', Object.keys(SCREENS).join(', '))
    process.exit(0)
  }
  const results = await capture({
    dist: args.dist ?? 'dist',
    out: args.out ?? 'shots',
    screens: typeof args.screens === 'string' ? args.screens.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    desktop: !!args.desktop,
    src: typeof args.src === 'string' ? args.src : undefined,
    now: typeof args.now === 'string' ? new Date(args.now) : undefined,
    suffix: typeof args.suffix === 'string' ? args.suffix : '',
  })
  console.log(JSON.stringify(results.map(r => ({ screen: r.screen, size: r.size, file: r.file, ready: r.ready, misses: r.misses, errors: r.errors })), null, 2))
}
