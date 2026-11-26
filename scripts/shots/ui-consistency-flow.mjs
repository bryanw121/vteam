#!/usr/bin/env node
/**
 * UX/UI consistency (#377): the same kind of thing looks the same on every screen.
 * Opens every SCREENS entry of the mocked export on phone and desktop, measures it
 * (lib/uiConsistency.mjs MEASURE_IN_PAGE) and counts what breaks each rule (RULES).
 * Counts above scripts/shots/ui-consistency-baseline.json fail; the baseline only
 * shrinks (`npm run ui:baseline` after a fix).
 *
 *   node scripts/shots/ui-consistency-flow.mjs --dist dist-mock [--out ui-report] [--screens a,b] [--update-baseline]
 *
 * Writes <out>/summary.md (also to $GITHUB_STEP_SUMMARY in CI), <out>/results.json and a
 * screenshot of every screen with a new finding.
 */
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs, visitScreens } from './capture.mjs'
import { MEASURE_IN_PAGE, actionFillsFrom, baselineFrom, diffBaseline, fontTokensFrom, judge, renderMarkdown } from './lib/uiConsistency.mjs'

const args = parseArgs(process.argv.slice(2))
const out = resolve(args.out || 'ui-report')
const BASELINE = resolve('scripts/shots/ui-consistency-baseline.json')
await mkdir(out, { recursive: true })

const themeSource = await readFile(resolve('constants/theme.ts'), 'utf8')
const tokens = fontTokensFrom(themeSource)
const actionFills = actionFillsFrom(themeSource)
const screens = args.screens ? String(args.screens).split(',') : undefined
const { results: visits } = await visitScreens(
  { dist: args.dist || 'dist-mock', screens, sizes: ['mobile', 'desktop'], concurrency: Number(args.concurrency ?? 4), label: 'ui' },
  async (page, r) => {
    const measured = await page.evaluate(MEASURE_IN_PAGE)
    // Kept in memory until judged; written only for screens with a new finding.
    r.png = await page.screenshot({ animations: 'disabled', caret: 'hide' })
    return measured
  },
)

const skipped = []
const results = []
for (const v of visits) {
  if (!v.output) { skipped.push(`${v.screen} (${v.size})`); continue }
  const { counts, examples } = judge(v.output, { viewport: v.size, tokens, actionFills })
  results.push({ screen: v.screen, viewport: v.size, counts, examples, png: v.png })
}

const plain = results.map(({ png, ...r }) => r)
await writeFile(join(out, 'results.json'), JSON.stringify(plain, null, 1))

if (args['update-baseline']) {
  const previous = existsSync(BASELINE) ? JSON.parse(await readFile(BASELINE, 'utf8')) : {}
  const next = baselineFrom(plain)
  // A screen that didn't load this run keeps its entry rather than looking fixed.
  for (const name of skipped.map(s => s.split(' ')[0])) if (previous[name] && !next[name]) next[name] = previous[name]
  const notes = previous._notes ?? { about: 'Accepted UI consistency findings (#377): screen → viewport → rule → count. Shrink-only: run `npm run ui:baseline` after a fix; never raise a count to get a PR through.' }
  await writeFile(BASELINE, JSON.stringify({ _notes: notes, ...next }, null, 2) + '\n')
  console.log(`Baseline written: ${Object.keys(next).length} screens with findings.`)
  process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(await readFile(BASELINE, 'utf8')) : {}
let diff = diffBaseline(plain, baseline)
// A screen still filling in can show a row more than it settles on: measure a failing screen
// once more and keep the lower count per rule before calling it new.
if (diff.failures.length) {
  const again = [...new Set(diff.failures.map(f => f.screen))]
  console.log(`Measuring again: ${again.join(', ')}`)
  const { results: second } = await visitScreens(
    { dist: args.dist || 'dist-mock', screens: again, sizes: ['mobile', 'desktop'], concurrency: Number(args.concurrency ?? 4), label: 'ui (again)' },
    async (page, r) => { r.png = await page.screenshot({ animations: 'disabled', caret: 'hide' }); return page.evaluate(MEASURE_IN_PAGE) },
  )
  for (const v of second) {
    if (!v.output) continue
    const r = results.find(x => x.screen === v.screen && x.viewport === v.size)
    const p = plain.find(x => x.screen === v.screen && x.viewport === v.size)
    if (!r || !p) continue
    const { counts, examples } = judge(v.output, { viewport: v.size, tokens, actionFills })
    for (const rule of new Set([...Object.keys(p.counts), ...Object.keys(counts)])) {
      const lower = Math.min(p.counts[rule] ?? 0, counts[rule] ?? 0)
      if (lower < (p.counts[rule] ?? 0)) { p.counts[rule] = lower; r.counts[rule] = lower; p.examples[rule] = examples[rule] ?? []; r.png = v.png }
    }
  }
  diff = diffBaseline(plain, baseline)
  await writeFile(join(out, 'results.json'), JSON.stringify(plain, null, 1))
}
for (const f of diff.failures) {
  const r = results.find(x => x.screen === f.screen && x.viewport === f.viewport)
  if (r?.png) await writeFile(join(out, `${f.screen}-${f.viewport}.png`), r.png)
}
const md = renderMarkdown({ results: plain, diff, skipped })
await writeFile(join(out, 'summary.md'), md)
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md)

console.log(`UI consistency: ${diff.judged} judged, ${diff.failures.length} new, ${diff.improved.length} fewer than the baseline${skipped.length ? `, ${skipped.length} not loaded` : ''}.`)
for (const f of diff.failures) console.log(`  NEW ${f.rule} ${f.screen} ${f.viewport}: ${f.count} (baseline ${f.base}) ${f.examples.join('; ')}`)
// The counts this run saw, so a baseline can be taken from CI's environment (the artifact has results.json too).
if (diff.failures.length || diff.improved.length) console.log(`Counts: ${JSON.stringify(plain.filter(r => Object.keys(r.counts).length).map(r => [r.screen, r.viewport, r.counts]))}`)
process.exit(diff.failures.length ? 1 : 0)
