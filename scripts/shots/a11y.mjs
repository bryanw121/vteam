#!/usr/bin/env node
/**
 * Accessibility check: axe-core (WCAG 2.0 A/AA + 2.1 AA) on every shots screen,
 * mobile and desktop, with every Supabase call mocked (no network, no secrets).
 *
 *   node scripts/shots/a11y.mjs [--dist dist-mock] [--out a11y-report] [--screens a,b]
 *                               [--mobile-only] [--update-baseline] [--src .] [--now ISO]
 *
 * The export must be built against the mock project URL, like the shots tool:
 *   EXPO_PUBLIC_SUPABASE_URL=https://shotsmock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=shots-mock-anon-key npx expo export -p web --output-dir dist-mock
 *
 * Serious and critical findings are compared with scripts/shots/a11y-baseline.json
 * (screen → viewport → rule → node count): a rule new to a screen, or a count above
 * the baseline, fails (exit 1). Lower counts pass with a note to run
 * `npm run a11y:baseline`. Minor and moderate findings are reported only.
 *
 * Writes <out>/a11y-report.json, <out>/index.html and <out>/summary.md (also
 * printed; CI appends it to the job summary).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, visitScreens } from './capture.mjs'
import { SCREENS } from './screens.mjs'
import { baselineFrom, diffBaseline, renderHtml, renderMarkdown } from './lib/a11yBaseline.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const BASELINE_FILE = join(HERE, 'a11y-baseline.json')
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa']

const require = createRequire(import.meta.url)
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const AXE_VERSION = require('axe-core/package.json').version

/** The `onReady` for visitScreens: inject axe and keep a compact copy of its violations. */
async function scan(page) {
  await page.addScriptTag({ content: AXE_SOURCE })
  const res = await page.evaluate(tags => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), AXE_TAGS)
  return res.violations.map(v => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    target: v.nodes[0]?.target?.flat().join(' ') ?? null,
    summary: v.nodes[0]?.failureSummary?.split('\n').slice(0, 2).join(' ').slice(0, 200) ?? null,
  }))
}

export async function runA11y(o) {
  const t = Date.now()
  const { results } = await visitScreens(
    { dist: o.dist, screens: o.screens, sizes: o.mobileOnly ? ['mobile'] : ['mobile', 'desktop'], src: o.src, now: o.now, label: 'a11y', concurrency: o.concurrency },
    scan,
  )
  const scans = results.map(r => ({
    screen: r.screen, size: r.size, ready: r.ready, misses: r.misses,
    // A screen whose ready text never showed is still scanned (as the shots tool shoots it); only a failed load counts as an error.
    errors: r.output ? [] : r.errors, pageErrors: r.output ? r.errors : [],
    violations: r.output ?? [],
  }))
  return { scans, seconds: Math.round((Date.now() - t) / 1000) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('node scripts/shots/a11y.mjs [--dist dist-mock] [--out a11y-report] [--screens a,b] [--mobile-only] [--update-baseline] [--src .] [--now ISO]')
    process.exit(0)
  }
  const out = typeof args.out === 'string' ? args.out : 'a11y-report'
  const screens = typeof args.screens === 'string' ? args.screens.split(',').map(s => s.trim()).filter(Boolean) : undefined
  const { scans, seconds } = await runA11y({
    dist: typeof args.dist === 'string' ? args.dist : 'dist-mock',
    screens,
    mobileOnly: !!args['mobile-only'],
    concurrency: args.concurrency ? Number(args.concurrency) : 6,
    src: typeof args.src === 'string' ? args.src : undefined,
    now: typeof args.now === 'string' ? new Date(args.now) : undefined,
  })
  const baseline = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) : {}

  if (args['update-baseline']) {
    const failed = scans.filter(s => s.errors.length)
    let next = baselineFrom(scans, baseline)
    // A full run drops screens that no longer exist.
    if (!screens) next = Object.fromEntries(Object.entries(next).filter(([s]) => SCREENS[s]))
    writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + '\n')
    process.stderr.write(`[a11y] wrote ${BASELINE_FILE} (${Object.keys(next).length} screens, ${seconds}s)\n`)
    if (failed.length) {
      process.stderr.write(`[a11y] not updated (scan failed): ${failed.map(f => `${f.screen} ${f.size}: ${f.errors.join(' | ')}`).join('; ')}\n`)
      process.exit(1)
    }
    process.exit(0)
  }

  const diff = diffBaseline(scans, baseline, { allScreens: screens ? undefined : Object.keys(SCREENS) })
  const meta = { axeVersion: AXE_VERSION, tags: AXE_TAGS, seconds }
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'a11y-report.json'), JSON.stringify({ axeVersion: AXE_VERSION, tags: AXE_TAGS, seconds, ok: diff.ok, failures: diff.failures, improvements: diff.improvements, stale: diff.stale, results: scans }, null, 2))
  writeFileSync(join(out, 'index.html'), renderHtml(scans, diff, meta))
  const md = renderMarkdown(scans, diff, meta)
  writeFileSync(join(out, 'summary.md'), md)
  // What `a11y:baseline` would write from this scan. CI's fonts can move a few contrast nodes
  // on wide screens: copy this file from the CI artifact rather than regenerating locally.
  if (!screens) writeFileSync(join(out, 'a11y-baseline.next.json'), JSON.stringify(Object.fromEntries(Object.entries(baselineFrom(scans, baseline)).filter(([s]) => SCREENS[s])), null, 2) + '\n')
  console.log(md)
  for (const f of diff.failures) {
    const msg = f.kind === 'scan-error' ? `${f.screen} (${f.size}): scan failed: ${f.message}` : `${f.rule} (${f.impact}) on ${f.screen} (${f.size}): ${f.baseline} → ${f.count} nodes. ${f.helpUrl}`
    process.stderr.write(`[a11y] FAIL ${msg}\n`)
    // GitHub shows these on the PR's checks (the first 10 per step).
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=a11y ${f.rule ?? 'scan error'}::${msg.replace(/\n/g, ' ')}`)
  }
  process.exit(diff.ok ? 0 : 1)
}
