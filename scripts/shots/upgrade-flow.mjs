#!/usr/bin/env node
/**
 * Upgrade check (#317): every PR opens on a device that last ran `main`.
 *
 * The Nov 13 crash came from data the previous build saved on the device (an
 * `ads:feed` copy in its old shape) read by the new build. Every other check starts
 * from empty storage. This one opens the BEFORE export as a returning player
 * (signed in, and as a guest), visits the first screens so everything the app keeps
 * on the device gets written (query and feed snapshots, filters, tab views, ...),
 * then opens the AFTER export with exactly that storage and fails when a screen
 * crashes (the error boundary), throws (pageerror) or hits a hydration mismatch
 * (React #418). Both builds read the same mocked Supabase, so only what was saved
 * on the device differs.
 *
 *   node scripts/shots/upgrade-flow.mjs --before dist-base --after dist-mock [--out upgrade-report] [--only phone]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'
import { IDS } from './fixtures/index.mjs'
import { crashText, deviceKeys, moveStorage, renderSummary } from './lib/upgrade.mjs'

const args = parseArgs(process.argv.slice(2))
if (!args.before || !args.after) {
  console.error('usage: node scripts/shots/upgrade-flow.mjs --before <dist> --after <dist> [--out dir]')
  process.exit(2)
}
const out = resolve(args.out || 'upgrade-report')
const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 860 } },
}
/** First screens a returning player opens, plus the stack screens that keep things on the device. */
const SCREENS = {
  in: ['/', '/profile', '/chat', '/clubs', '/tournaments', '/leagues', `/event/${IDS.event.sundaySand}`, `/club/${IDS.club.eastside}`, '/scorekeeper', '/scorekeeper/simple', '/'],
  guest: ['/', '/clubs', '/tournaments', '/leagues', `/event/${IDS.event.sundaySand}`, '/'],
}
/** Long enough for the snapshot writer (1 s debounce) and the feed snapshot after the first rows. */
const SETTLE_MS = 2500

const viewports = args.only ? String(args.only).split(',') : Object.keys(VIEWPORTS)
const now = defaultNow()
const seenIds = loadSeenIds(process.cwd())
const relationships = loadRelationships(process.cwd())
await mkdir(out, { recursive: true })
const before = await serveDist(resolve(args.before))
const after = await serveDist(resolve(args.after))
const results = []
let browser

async function context(viewport, signedIn, storageState) {
  const ctx = await browser.newContext({ ...VIEWPORTS[viewport], timezoneId: TIME_ZONE, locale: 'en-US', storageState })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]))
  page.on('console', m => { if (m.type() === 'error' && /#418|Hydration/i.test(m.text())) errors.push(m.text().split('\n')[0]) })
  await installSupabaseMock(page, { now, signedIn, seenIds, relationships })
  return { ctx, page, errors }
}

try {
  browser = await launchChromium()
  for (const viewport of viewports) {
    for (const who of ['in', 'guest']) {
      const signedIn = who === 'in'
      // 1. The previous build, as a returning player: let it save what it saves.
      const old = await context(viewport, signedIn)
      for (const path of SCREENS[who]) {
        await old.page.goto(before.url + path, { waitUntil: 'load' })
        await old.page.waitForTimeout(SETTLE_MS)
      }
      const saved = moveStorage(await old.ctx.storageState(), before.url, after.url)
      const keys = deviceKeys(saved, after.url)
      await old.ctx.close()

      // 2. The new build, on that device.
      const cur = await context(viewport, signedIn, saved)
      for (const path of SCREENS[who]) {
        const label = `${viewport} · ${signedIn ? 'signed in' : 'guest'} · ${path}`
        cur.errors.length = 0
        await cur.page.goto(after.url + path, { waitUntil: 'load' })
        await cur.page.waitForTimeout(SETTLE_MS)
        const crash = await crashText(cur.page)
        const errors = [...new Set(cur.errors)]
        const ok = !crash && errors.length === 0
        let frame = null
        if (!ok) {
          frame = `${viewport}-${who}-${path.replace(/[^a-z0-9]+/gi, '_') || 'root'}.png`
          await cur.page.screenshot({ path: resolve(out, frame) })
        }
        results.push({ viewport, who, path, ok, crash, errors, keys, frame })
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${crash ? ` (error screen: "${crash}")` : ''}${errors.length ? ` (${errors[0]})` : ''}`)
      }
      await cur.ctx.close()
    }
  }
} finally {
  await browser?.close()
  await before.close()
  await after.close()
  await writeFile(resolve(out, 'report.json'), JSON.stringify(results, null, 2))
  await writeFile(resolve(out, 'summary.md'), renderSummary(results))
}

const failed = results.filter(r => !r.ok)
console.log(failed.length ? `Upgrade check: ${failed.length} screen(s) broke on a device that ran the previous build.` : `Upgrade check: ${results.length} screens opened cleanly on a device that ran the previous build.`)
process.exit(failed.length ? 1 : 0)
