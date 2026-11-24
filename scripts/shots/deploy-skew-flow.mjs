#!/usr/bin/env node
/**
 * A deploy never crashes an open tab (#359), in the real web export with every
 * Supabase call mocked. Web routes are lazy chunks named by content hash; a
 * deploy removes the old build's files, so a tab opened before it fails to load
 * the first screen it hasn't opened yet (the one live crash, Nov 20: /leagues
 * twice). The flow opens Events, then "deploys": every route chunk not loaded
 * yet now answers like a missing file, and /version.json names another build.
 *
 * - html / 404: tapping Leagues shows "Getting the latest vteam…", the tab
 *   reloads into the new build (no crash screen, no `app_crash`, one
 *   `app_updated_in_tab` {how: chunk}), says so in a toast, and Leagues opens.
 *   `html` is the old vercel.json answer (index.html, 200), `404` the new one.
 * - offline: /version.json doesn't answer either: "Couldn't load this screen",
 *   no reload, no `app_crash`.
 * - resume (needs --sha, the commit the export was built with, so the app knows
 *   its own build): a tab back after 11 minutes hidden, with a newer build live,
 *   reloads straight away and says so.
 *
 *   node scripts/shots/deploy-skew-flow.mjs --dist dist-mock [--sha <export's commit>] [--out shots/deploy-skew]
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const dist = resolve(args.dist || 'dist')
const out = resolve(args.out || 'shots/deploy-skew')
const sha = typeof args.sha === 'string' && /^[0-9a-f]{40}$/.test(args.sha) ? args.sha : null
const CRASH = /This screen hit a snag|Still not working/
const NEW_BUILD = 'b'.repeat(40) === sha ? 'c'.repeat(40) : 'b'.repeat(40)
const CHUNK_RE = /\/_expo\/static\/js\/web\/.*\.js(\?.*)?$/
const SURFACES = [
  ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ['desktop', { viewport: { width: 1280, height: 860 } }],
]
const report = []
await mkdir(out, { recursive: true })
const indexHtml = await readFile(resolve(dist, 'index.html'))
const server = await serveDist(dist)
let browser

async function open(surface, opts) {
  const context = await browser.newContext({ ...opts, timezoneId: TIME_ZONE, locale: 'en-US', serviceWorkers: 'block' })
  await context.clock.install({ time: defaultNow() })
  await context.addInitScript(() => { try { localStorage.setItem('vteam.analytics', 'on') } catch { /* ignore */ } })
  const page = await context.newPage()
  const events = []
  const errors = []
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]))
  page.on('request', req => {
    if (req.method() === 'POST' && /\/rest\/v1\/app_events/.test(req.url())) {
      try { for (const row of [].concat(JSON.parse(req.postData() ?? '[]'))) events.push(row) } catch { /* not JSON */ }
    }
  })
  await installSupabaseMock(page, { now: defaultNow(), signedIn: false })
  return { context, page, events, errors }
}

/** After this, chunks not loaded yet answer like a deploy removed them, until the page loads again. */
async function deploy(page, shape, { versionAnswers = true } = {}) {
  let gone = true
  // A full page load is the new build: from its document request on, every file is there.
  page.on('request', req => { if (req.isNavigationRequest() && req.frame() === page.mainFrame()) gone = false })
  await page.route(CHUNK_RE, route => {
    if (!gone) return route.continue()
    if (shape === 'html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: indexHtml })
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
  })
  await page.route(/\/version\.json(\?.*)?$/, route => versionAnswers
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: NEW_BUILD, builtAt: new Date().toISOString() }) })
    : route.abort('internetdisconnected'))
}

const leagues = page => page.locator('[data-testid="leagues-soon"],[data-testid="leagues-open"],[data-testid="leagues-later"]').first()
const named = (events, name) => events.filter(e => e.name === name)

try {
  browser = await launchChromium()
  for (const [surface, opts] of SURFACES) {
    for (const shape of ['html', '404']) {
      const { context, page, events } = await open(surface, opts)
      try {
        await page.goto(`${server.url}/`, { waitUntil: 'load' })
        await page.getByText(/^Leagues/).first().waitFor({ timeout: 20000 })
        await page.waitForTimeout(1500)
        await deploy(page, shape)
        const reloaded = page.waitForEvent('load', { timeout: 20000 })
        await page.getByText(/^Leagues/).first().click()
        await reloaded
        await page.getByText(/^Leagues/).first().waitFor({ timeout: 20000 })
        await expect(page.getByText('vteam was updated while you were away', { exact: false })).toBeVisible({ timeout: 10000 })
        await page.screenshot({ path: resolve(out, `${surface}-${shape}-after-reload.png`) })
        assert.equal(await page.getByText(CRASH).count(), 0, `${surface}/${shape}: the crash screen showed`)
        await page.getByText(/^Leagues/).first().click()
        await leagues(page).waitFor({ state: 'visible', timeout: 20000 })
        await expect.poll(() => named(events, 'app_updated_in_tab').length, { timeout: 12000, message: `${surface}/${shape}: app_updated_in_tab not sent` }).toBeGreaterThan(0)
        assert.equal(named(events, 'app_updated_in_tab')[0].props.how, 'chunk')
        assert.equal(named(events, 'app_crash').length, 0, `${surface}/${shape}: app_crash was sent`)
        report.push({ surface, case: shape, ok: true })
        console.log(`  deploy-skew ${surface}/${shape}: reloaded into the new build, Leagues opened, no crash`)
      } finally {
        await context.close()
      }
    }

    // Offline: the host doesn't answer /version.json either.
    {
      const { context, page, events } = await open(surface, opts)
      try {
        await page.goto(`${server.url}/`, { waitUntil: 'load' })
        await page.getByText(/^Leagues/).first().waitFor({ timeout: 20000 })
        await page.waitForTimeout(1500)
        await deploy(page, '404', { versionAnswers: false })
        await page.getByText(/^Leagues/).first().click()
        await expect(page.getByText("Couldn't load this screen")).toBeVisible({ timeout: 15000 })
        await page.screenshot({ path: resolve(out, `${surface}-offline.png`) })
        assert.equal(await page.getByText(CRASH).count(), 0, `${surface}/offline: the crash screen showed`)
        await page.waitForTimeout(1500)
        assert.equal(named(events, 'app_crash').length, 0, `${surface}/offline: app_crash was sent`)
        report.push({ surface, case: 'offline', ok: true })
        console.log(`  deploy-skew ${surface}/offline: "Couldn't load this screen", no crash`)
      } finally {
        await context.close()
      }
    }

    // Resume: back after 11 minutes hidden, a newer build is live.
    if (sha) {
      const { context, page } = await open(surface, opts)
      try {
        await page.goto(`${server.url}/`, { waitUntil: 'load' })
        await page.getByText(/^Leagues/).first().waitFor({ timeout: 20000 })
        await page.waitForTimeout(1500)
        await deploy(page, '404')
        const setVisibility = state => page.evaluate(s => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' })
          document.dispatchEvent(new Event('visibilitychange'))
        }, state)
        await setVisibility('hidden')
        await page.clock.fastForward('11:00')
        const reloaded = page.waitForEvent('load', { timeout: 20000 })
        await setVisibility('visible')
        await reloaded
        await expect(page.getByText('vteam was updated while you were away.', { exact: false })).toBeVisible({ timeout: 15000 })
        report.push({ surface, case: 'resume', ok: true })
        console.log(`  deploy-skew ${surface}/resume: reloaded into the new build on return`)
      } finally {
        await context.close()
      }
    } else if (surface === 'phone') {
      console.log('  deploy-skew resume: skipped (pass --sha <the commit the export was built with>)')
    }
  }
} finally {
  await browser?.close()
  await server.close()
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
}
