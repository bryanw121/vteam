#!/usr/bin/env node
/**
 * A crash never sticks (#316), in the real web export with every Supabase call mocked.
 * A returning player whose saved Profile copy no longer fits the code (wrong-shape
 * `badges` / `trophies` entries in `vteam.querySnapshot`, the Nov 13 class) sees the
 * error screen once; Try again brings Profile back; `app_crash` is sent at once; and
 * a reload with the same bad copy within 10 minutes starts safe and doesn't crash.
 * Before #316 Try Again and a reload both crashed again.
 *
 *   node scripts/shots/crash-recovery-flow.mjs --dist dist-mock [--out shots/crash-recovery]
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const out = resolve(args.out || 'shots/crash-recovery')
const CRASH_TITLE = 'This screen hit a snag'
const SNAPSHOT = 'vteam.querySnapshot'
const POISON = ['badges', 'trophies']
const report = []
await mkdir(out, { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
let browser

/** The saved snapshot with the badges / trophies entries swapped for the wrong shape. */
async function poisoned(page) {
  await expect.poll(() => page.evaluate(k => {
    const raw = localStorage.getItem(k)
    return raw ? Object.keys(JSON.parse(raw).entries).filter(key => /^(badges|trophies):/.test(key)).length : 0
  }, SNAPSHOT), { timeout: 20000, message: 'Profile never saved its badges and trophies' }).toBe(POISON.length)
  return page.evaluate(k => {
    const s = JSON.parse(localStorage.getItem(k))
    for (const key of Object.keys(s.entries)) if (/^(badges|trophies):/.test(key)) s.entries[key] = { shape: 'from an older build' }
    return JSON.stringify(s)
  }, SNAPSHOT)
}

const crashShown = page => page.getByText(CRASH_TITLE).count()

try {
  browser = await launchChromium()
  for (const [surface, opts] of [['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1280, height: 860 } }]]) {
    const context = await browser.newContext({ ...opts, timezoneId: TIME_ZONE, locale: 'en-US' })
    await context.addInitScript(() => { try { localStorage.setItem('vteam.analytics', 'on') } catch { /* ignore */ } })
    const page = await context.newPage()
    const crashes = []
    page.on('request', req => {
      if (req.method() === 'POST' && /\/rest\/v1\/app_events/.test(req.url())) {
        try { for (const row of [].concat(JSON.parse(req.postData() ?? '[]'))) if (row.name === 'app_crash') crashes.push(row) } catch { /* not JSON */ }
      }
    })
    try {
      await installSupabaseMock(page, { now: defaultNow(), signedIn: true, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
      await page.goto(`${server.url}/profile`, { waitUntil: 'load' })
      const bad = await poisoned(page)

      // 1. The bad copy crashes Profile once.
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SNAPSHOT, bad])
      await page.reload({ waitUntil: 'load' })
      await expect(page.getByText(CRASH_TITLE)).toBeVisible({ timeout: 20000 })
      await page.getByText('BETA', { exact: true }).waitFor({ state: 'detached', timeout: 20000 }).catch(() => {})
      await page.screenshot({ path: resolve(out, `${surface}-crash.png`) })
      await expect.poll(() => crashes.length, { timeout: 5000, message: `${surface}: app_crash was not sent at once` }).toBeGreaterThan(0)
      assert.equal(crashes[0].props.screen.includes('-'), false, `${surface}: app_crash carries an id: ${crashes[0].props.screen}`)

      // 2. Try again recovers: the saved copy is gone and Profile is back.
      await page.getByText('Try again', { exact: true }).click()
      await page.waitForTimeout(3000)
      assert.equal(await crashShown(page), 0, `${surface}: Try again crashed again`)
      await page.screenshot({ path: resolve(out, `${surface}-recovered.png`) })

      // 3. The same bad copy, reopened within 10 minutes: safe start, no crash.
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SNAPSHOT, bad])
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(4000)
      assert.equal(await crashShown(page), 0, `${surface}: reload within 10 min crashed on the old copy`)

      report.push({ surface, crashes: crashes.length, ok: true })
      console.log(`  crash-recovery ${surface}: crashed once, Try again recovered, safe start held (${crashes.length} app_crash sent)`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser?.close()
  await server.close()
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
}
