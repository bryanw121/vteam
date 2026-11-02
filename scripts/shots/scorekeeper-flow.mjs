#!/usr/bin/env node
/**
 * Walks the experimental scorekeeper end to end on a mocked web export and screenshots each
 * step (the user flow in the PR). It also closes the page mid-set and reopens it, checking the
 * match comes back exactly (score, server, undo history).
 *
 *   node scripts/shots/scorekeeper-flow.mjs --dist dist-mock --out shots/scorekeeper [--desktop]
 *
 * Build the export against the mock URL first (see README.md). Exits 1 if a check fails.
 */
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { VIEWPORTS, launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const dist = resolve(args.dist ?? 'dist-mock')
const out = resolve(args.out ?? 'shots/scorekeeper')
const size = args.desktop ? 'desktop' : 'mobile'
await mkdir(out, { recursive: true })

const failures = []
const check = (ok, what) => { if (!ok) failures.push(what); process.stderr.write(`  ${ok ? 'ok ' : 'FAIL'} ${what}\n`) }

const server = await serveDist(dist)
const browser = await launchChromium()
const now = defaultNow()
const opts = { now, relationships: loadRelationships(process.cwd()), seenIds: loadSeenIds(process.cwd()) }
const context = await browser.newContext({ ...VIEWPORTS[size], locale: 'en-US', timezoneId: TIME_ZONE, reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block' })
let step = 0
const errors = []

async function open(page) {
  page.on('pageerror', e => errors.push(e.message.split('\n')[0]))
  await installSupabaseMock(page, { now: opts.now, signedIn: true, seenIds: opts.seenIds, relationships: opts.relationships })
}
async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(600)
  const file = join(out, `${String(++step).padStart(2, '0')}-${name}${size === 'desktop' ? '-desktop' : ''}.png`)
  await page.screenshot({ path: file, fullPage, animations: 'disabled', caret: 'hide' })
  process.stderr.write(`  shot ${file}\n`)
}
const tap = (page, id) => page.getByTestId(id).first().click({ timeout: 10000 })
const text = (page, t) => page.getByText(t, { exact: false }).first()

try {
  let page = await context.newPage()
  await open(page)

  // 1. Profile menu → Experimental features
  await page.goto(server.url + '/profile', { waitUntil: 'load' })
  await page.getByTestId('profile-menu-experimental').waitFor({ timeout: 20000 })
  await page.getByTestId('profile-menu-experimental').scrollIntoViewIfNeeded()
  await shot(page, 'profile-menu')
  await tap(page, 'profile-menu-experimental')
  await text(page, 'Scorekeeper').waitFor()
  await shot(page, 'experimental-features')

  // 2. Scorekeeper home → New match
  await tap(page, 'experiment-scorekeeper')
  await page.getByTestId('new-match').waitFor()
  await shot(page, 'scorekeeper-empty')
  await tap(page, 'new-match')
  await page.getByTestId('team-name-A').waitFor()
  const fill = async (id, value) => {
    const el = page.getByTestId(id)
    const inner = el.locator('input, textarea')
    if (await inner.count()) await inner.first().fill(value)
    else await el.fill(value)
  }
  await fill('team-name-A', 'Aces')
  await fill('team-name-B', 'Blockers')
  await shot(page, 'new-match-empty')

  // 3. Put the starting six on the court: tap position I, then each save moves to the next spot.
  const starters = [[1, 'Maya'], [2, 'Jess'], [3, 'Priya'], [4, 'Lena'], [5, 'Sofia'], [6, 'Tori'], [11, 'Ana'], [12, 'Bea'], [13, 'Cara'], [14, 'Dee'], [15, 'Eve'], [16, 'Fay']]
  await tap(page, 'spot-A-0')
  for (const [i, [n, name]] of starters.entries()) {
    await page.getByTestId('player-number').waitFor()
    await fill('player-number', String(n))
    await fill('player-name', name)
    if (i === 2) await shot(page, 'player-sheet')
    await tap(page, 'player-save')
    await page.waitForTimeout(250)
  }
  const bench = { A: [[7, 'Nina'], [8, 'Rae'], [20, 'Kim', true]], B: [[17, 'Gia'], [30, 'Hana', true]] }
  for (const side of ['A', 'B']) {
    for (const [n, name, libero] of bench[side]) {
      await tap(page, `bench-add-${side}`)
      await page.getByTestId('player-number').waitFor()
      await fill('player-number', String(n))
      await fill('player-name', name)
      if (libero) await tap(page, 'player-libero')
      await tap(page, 'player-save')
      await page.waitForTimeout(250)
    }
  }
  await tap(page, 'first-serve-A')
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, 'new-match-court')
  await shot(page, 'new-match-full', true)
  await tap(page, 'start-match')

  // 4. Scoring
  await page.getByTestId('point-A').waitFor()
  const point = async side => { await tap(page, `point-${side}`); await page.waitForTimeout(450) }
  for (const s of ['A', 'A', 'B', 'A', 'B', 'B', 'A']) await point(s)
  await shot(page, 'scoring', true)
  check(await page.getByTestId('score-A').innerText().then(t => t.includes('4')), 'score A is 4 after 7 rallies')

  // Libero in for the back-row player, then a substitution from the court
  await tap(page, 'action-libero')
  await page.getByTestId('libero-in').waitFor()
  const backRow = await page.locator('[data-testid^="libero-for-"]').first().getAttribute('data-testid')
  await tap(page, backRow)
  await shot(page, 'libero-sheet')
  await tap(page, 'libero-in')
  await tap(page, 'court-A-2')
  await page.getByTestId('sub-confirm').waitFor()
  await tap(page, 'sub-in-7')
  await shot(page, 'sub-sheet')
  await tap(page, 'sub-confirm')

  // A third time-out raises a warning but is recorded
  for (let i = 0; i < 3; i++) { await tap(page, 'action-timeout'); await tap(page, 'timeout-B') }
  await page.getByTestId('score-warning').waitFor()
  await shot(page, 'warning-recorded')

  // 5. Close the tab mid-set and come back
  const url = page.url()
  const before = await page.getByTestId('score-A').innerText()
  const serverBefore = await page.getByTestId('server-row').innerText()
  await page.close()
  page = await context.newPage()
  await open(page)
  await page.goto(url, { waitUntil: 'load' })
  await page.getByTestId('point-A').waitFor({ timeout: 20000 })
  check((await page.getByTestId('score-A').innerText()) === before, 'score restored after closing the tab')
  check((await page.getByTestId('server-row').innerText()) === serverBefore, 'server restored after closing the tab')
  check(await page.getByTestId('action-undo').isEnabled(), 'undo history restored')
  await shot(page, 'resumed-after-close')

  // Resume card on Experimental features
  await page.goto(server.url + '/settings/experimental', { waitUntil: 'load' })
  await page.getByTestId('experimental-resume').waitFor({ timeout: 15000 })
  await shot(page, 'resume-card')
  await page.getByTestId('experimental-resume').locator('[data-testid^="match-row-"]').first().click()
  await page.getByTestId('point-A').waitFor()

  // 6. Mistakes: undo / redo, flip a past rally in the timeline, wrong server, fix sheet
  await tap(page, 'action-undo')
  await tap(page, 'action-redo')
  await tap(page, 'action-timeline')
  await page.locator('[data-testid^="timeline-"]').first().waitFor()
  const rally = page.getByText('Point Blockers', { exact: true }).first()
  await rally.click()
  await shot(page, 'timeline-fix')
  await tap(page, 'timeline-flip')
  await page.keyboard.press('Escape')
  await page.getByTestId('bottom-sheet-backdrop').first().click({ timeout: 3000 }).catch(() => {})
  await tap(page, 'server-row')
  await page.getByTestId('wrong-confirm').waitFor()
  await tap(page, 'wrong-discovered-later')
  await shot(page, 'wrong-server')
  // The receiving team was out of position at the serve: point to the serving team.
  const servingTeam = (await page.getByTestId('server-row').innerText()).includes('Blockers') ? 'B' : 'A'
  const receiver = servingTeam === 'A' ? 'B' : 'A'
  const scoreBefore = await page.getByTestId(`score-${servingTeam}`).innerText()
  await tap(page, `fault-team-${receiver}`)
  await tap(page, 'wrong-positional')
  await shot(page, 'rotation-fault')
  await tap(page, 'wrong-confirm')
  await page.waitForTimeout(400)
  const n = s => Number((s.match(/\n(\d+)\n/) ?? [])[1])
  check(n(await page.getByTestId(`score-${servingTeam}`).innerText()) === n(scoreBefore) + 1, 'receiving team out of rotation gives the server a point')
  await tap(page, 'score-more')
  await tap(page, 'more-fix')
  await page.getByTestId('fix-confirm').waitFor()
  await shot(page, 'fix-scoreboard')
  await page.getByTestId('bottom-sheet-backdrop').first().click()

  // 7. Finish the set and the match quickly with the keyboard shortcuts (desktop) or taps
  for (let set = 0; set < 2; set++) {
    for (let i = 0; i < 30 && (await page.getByTestId('point-A').count()); i++) await point('A')
    if (set === 0) {
      await page.getByTestId('set-result').waitFor()
      await shot(page, 'set-over', true)
      await tap(page, 'start-set')
      await page.getByTestId('point-A').waitFor()
    }
  }
  await page.getByTestId('open-sheet').waitFor()
  await shot(page, 'match-over')
  await tap(page, 'open-sheet')
  await page.getByTestId('sheet-print').waitFor()
  await page.waitForTimeout(1500)
  await shot(page, 'scoresheet', true)
  const frame = page.frameLocator('iframe').first()
  check(await frame.getByText('Official Scoresheet').isVisible().catch(() => false), 'scoresheet renders')
} catch (e) {
  failures.push(e.message.split('\n')[0])
  process.stderr.write(`  FAIL ${e.message.split('\n')[0]}\n`)
} finally {
  await browser.close()
  await server.close()
}
if (errors.length) process.stderr.write(`page errors:\n  ${[...new Set(errors)].join('\n  ')}\n`)
if (failures.length) { console.error(`${failures.length} failure(s)`); process.exit(1) }
console.log('scorekeeper flow ok')
