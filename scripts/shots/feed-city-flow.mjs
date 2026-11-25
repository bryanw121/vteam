#!/usr/bin/env node
// Events feed: the city control ("Austin ▾" next to the month on phones, "Games around <city> · Change" on desktop; #339). On the mocked export (`--dist dist-mock`),
// as a guest and signed in, phone and desktop: the line names the city /api/where answers, the
// sheet lists the covered cities and marks the nearest, picking one updates the line and survives
// a reload, and "Use my location" (web) picks the nearest city to the device. `--out <dir>` keeps
// screenshots.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const out = args.out ? resolve(args.out) : null
if (out) await mkdir(out, { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
let browser
const failures = []
try {
  browser = await launchChromium()
  for (const [surface, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    for (const signedIn of [false, true]) {
      const who = `${surface}/${signedIn ? 'signed-in' : 'guest'}`
      const context = await browser.newContext({ viewport, timezoneId: 'America/Chicago', geolocation: { latitude: 29.79, longitude: -95.82 }, permissions: ['geolocation'] })
      const now = defaultNow()
      await context.clock.install({ time: now })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      try {
        await installSupabaseMock(page, { now, signedIn, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
        // The visitor's network is near Dallas.
        await page.route(u => /\/api\/where\b/.test(u.pathname), r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"region":"dallas"}' }))
        await page.goto(`${server.url}/`, { waitUntil: 'load' })
        const line = page.getByTestId('feed-city').locator('visible=true')
        // A guest opens on the city near their network; the fixture member's home city (Austin) wins.
        const first = signedIn ? 'Austin' : 'Dallas', other = signedIn ? 'dallas' : 'austin', otherName = signedIn ? 'Dallas' : 'Austin'
        await expect(line).toContainText(first, { timeout: 20000 })
        if (out) await page.screenshot({ path: `${out}/${surface}-${signedIn ? 'signed-in' : 'guest'}-line.png` })
        await line.click()
        const sheet = page.getByTestId('bottom-sheet')
        await expect(sheet).toContainText('Show games around')
        if (!signedIn) await expect(page.getByTestId('feed-city-dallas')).toContainText('Nearest to you')
        await expect(page.getByTestId(`feed-city-${first.toLowerCase()}`)).toHaveAttribute('aria-checked', 'true')
        if (out) await page.screenshot({ path: `${out}/${surface}-${signedIn ? 'signed-in' : 'guest'}-sheet.png` })
        await page.getByTestId(`feed-city-${other}`).click()
        await expect(line).toContainText(otherName)
        await page.reload({ waitUntil: 'load' })
        await expect(page.getByTestId('feed-city').locator('visible=true')).toContainText(otherName, { timeout: 20000 })
        // "Use my location": the device is in Katy, so Houston.
        await page.getByTestId('feed-city').locator('visible=true').click()
        await page.getByTestId('feed-city-locate').click()
        await expect(page.getByTestId('feed-city').locator('visible=true')).toContainText('Houston', { timeout: 10000 })
        assert.deepEqual(errors, [], `${who}: page errors`)
        console.log(`ok ${who}`)
      } catch (e) {
        failures.push(`${who}: ${e.message.split('\n')[0]}`)
        if (out) await page.screenshot({ path: `${out}/${surface}-${signedIn ? 'signed-in' : 'guest'}-FAIL.png` }).catch(() => {})
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser?.close()
  await server.close()
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log('Feed city: all good.')
