#!/usr/bin/env node
/** Verify every bundled badge tier in the real web export, with no live data. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'
import { ME } from './fixtures/index.mjs'

const args = parseArgs(process.argv.slice(2))
const out = resolve(args.out || 'shots/badge-artwork')
const source = await readFile('constants/badges.ts', 'utf8')
const definitions = source.split('export const BADGE_DEFINITIONS: BadgeDef[] = [')[1].split('// ─── Profile borders')[0]
const catalog = [...definitions.matchAll(/type: '([^']+)'([\s\S]*?)(?=\n    type: '|$)/g)].map(([, type, body]) => ({
  type, tiers: [...body.matchAll(/tier:\s*(\d+),\s*label:\s*'([^']+)'/g)].map(([, tier, label]) => ({ tier: +tier, label })),
}))
assert.equal(catalog.length, 14)
assert.equal(catalog.reduce((n, def) => n + def.tiers.length, 0), 36)
const accents = ['bronze', 'silver', 'gold', 'platinum', 'diamond']
const checked = new Set()
const report = []
await mkdir(out, { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
let browser
try {
  browser = await launchChromium()
  for (const [surface, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
    for (let earnedTier = 0; earnedTier <= 5; earnedTier++) {
      const context = await browser.newContext({ viewport, timezoneId: 'America/Chicago' })
      const now = defaultNow()
      await context.clock.install({ time: now })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()) })
      try {
        const { db } = await installSupabaseMock(page, { now, signedIn: true, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
        const rows = db.rowsOf('user_badges')
        rows.splice(0, rows.length)
        if (earnedTier) rows.push(...catalog.map((def, i) => ({ id: `badge-${i}`, user_id: ME, badge_type: def.type, tier: Math.min(earnedTier, def.tiers.length), display_order: null, display_tier: null, awarded_at: now.toISOString() })))
        await page.goto(`${server.url}/settings/badges`, { waitUntil: 'load' })
        const grid = page.getByTestId('badges-grid')
        await expect(grid).toBeVisible({ timeout: 20000 })
        await expect(grid.locator('img')).toHaveCount(14)
        await expect.poll(() => grid.locator('img').evaluateAll(nodes => nodes.every(im => im.complete && im.naturalWidth > 0))).toBe(true)
        for (const def of catalog) {
          const tier = Math.max(1, Math.min(earnedTier, def.tiers.length))
          const id = `${def.type}_tier${tier}_${def.tiers.length === 1 ? 'special' : accents[tier-1]}`
          const image = grid.getByTestId(`badge-artwork-${def.type}`)
          const url = await image.locator('img').getAttribute('src')
          assert.ok(new URL(url, server.url).pathname.includes(`/badges/${id}.`), `${surface}: wrong image for ${id}: ${url}`)
          const label = def.tiers.find(t => t.tier === tier).label + (earnedTier ? '' : ' (locked)')
          await expect(image).toHaveAttribute('aria-label', label)
          const response = await page.request.get(new URL(url, server.url).href)
          assert.equal(response.status(), 200)
          const hash = bytes => createHash('sha256').update(bytes).digest('hex')
          assert.equal(hash(await response.body()), hash(await readFile(`assets/badges/${id}.png`)), `${id}: served bytes differ`)
          checked.add(id)
        }
        if (earnedTier === 0 || earnedTier === 5) {
          await page.evaluate(() => document.fonts.ready)
          await context.clock.runFor(300) // finish the app's 200ms splash fade
          await page.screenshot({ path: resolve(out, `${surface}-${earnedTier ? 'earned' : 'locked'}.png`), fullPage: true })
        }
        if (earnedTier === 5) {
          // An earned Legend can still display a lower tier. Exercise the real
          // picker, its write, and a fresh profile read after reloading.
          const attendance = db.rowsOf('user_badges').find(b => b.badge_type === 'event_attendee')
          attendance.display_order = 1
          attendance.display_tier = 1
          await page.goto(`${server.url}/profile`, { waitUntil: 'load' })
          await expect(page.getByTestId('badge-artwork-event_attendee')).toHaveAttribute('aria-label', 'Newcomer')
          await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
          await page.getByRole('button', { name: 'Remove badge from slot 1', exact: true }).click()
          await page.getByRole('button', { name: 'Pick a badge for slot 1', exact: true }).click()
          const picker = page.getByTestId('bottom-sheet')
          await expect(picker).toBeVisible()
          await expect(picker.getByTestId('badge-artwork-event_attendee')).toHaveCount(5)
          await picker.getByRole('img', { name: 'Regular', exact: true }).click()
          await expect.poll(() => db.rowsOf('user_badges').find(b => b.badge_type === 'event_attendee').display_tier).toBe(2)
          // The editor is in the URL (`?edit=1`): reload the plain profile to see the pinned badge once.
          await page.goto(`${server.url}/profile`, { waitUntil: 'load' })
          const pinned = page.getByTestId('badge-artwork-event_attendee')
          await expect(pinned).toHaveAttribute('aria-label', 'Regular')
          await expect(pinned.locator('img')).toHaveAttribute('src', /event_attendee_tier2_silver\./)
          await page.evaluate(() => document.fonts.ready)
          await context.clock.runFor(300)
          await page.screenshot({ path: resolve(out, `${surface}-pinned-tier.png`), fullPage: true })
        }
        report.push({ surface, earnedTier, categories: 14, loaded: true, correctTierAndBytes: true })
      } catch (error) {
        await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
        const storageKeys = await page.evaluate(() => Object.keys(localStorage))
        await writeFile(resolve(out, 'failure.json'), JSON.stringify({ surface, earnedTier, url: page.url(), text: await page.locator('body').innerText(), storageKeys, errors }, null, 2))
        throw error
      } finally { await context.close() }
    }
  }
  assert.equal(checked.size, 36)
  await writeFile(resolve(out, 'result.json'), JSON.stringify({ uniqueBadges: checked.size, scenarios: report }, null, 2))
  console.log(`PASS: ${checked.size} badge assets, ${report.length} desktop/mobile tier scenarios, labels, served PNG bytes, and lower-tier pinning across reload verified.`)
} finally {
  if (browser) await browser.close()
  await server.close()
}
