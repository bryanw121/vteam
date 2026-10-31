// node --test scripts/shots/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { baselineFrom, diffBaseline, renderHtml, renderMarkdown, summarizeRules } from './lib/a11yBaseline.mjs'
import { SCREENS } from './screens.mjs'

const v = (id, impact, nodes, extra = {}) => ({ id, impact, nodes, help: `${id} help`, helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`, target: `#${id}-target`, ...extra })
const scan = (screen, size, violations, errors = []) => ({ screen, size, violations, errors })

const BASELINE = {
  'events-feed': { mobile: { 'color-contrast': 16, 'document-title': 1 }, desktop: { 'color-contrast': 22 } },
  'settings-badges': { mobile: { 'aria-required-attr': 4 } },
}

test('unchanged scan passes with nothing to report', () => {
  const d = diffBaseline([
    scan('events-feed', 'mobile', [v('color-contrast', 'serious', 16), v('document-title', 'serious', 1)]),
    scan('events-feed', 'desktop', [v('color-contrast', 'serious', 22)]),
  ], BASELINE)
  assert.equal(d.ok, true)
  assert.deepEqual(d.failures, [])
  assert.deepEqual(d.improvements, [])
})

test('a serious/critical rule new to a screen fails', () => {
  const d = diffBaseline([scan('events-feed', 'mobile', [v('color-contrast', 'serious', 16), v('document-title', 'serious', 1), v('button-name', 'critical', 1)])], BASELINE)
  assert.equal(d.ok, false)
  assert.equal(d.failures.length, 1)
  assert.deepEqual(
    (({ kind, screen, size, rule, impact, baseline, count, newScreen }) => ({ kind, screen, size, rule, impact, baseline, count, newScreen }))(d.failures[0]),
    { kind: 'new-rule', screen: 'events-feed', size: 'mobile', rule: 'button-name', impact: 'critical', baseline: 0, count: 1, newScreen: false },
  )
})

test('a rule baselined on mobile is still new on desktop', () => {
  const d = diffBaseline([scan('events-feed', 'desktop', [v('color-contrast', 'serious', 22), v('document-title', 'serious', 1)])], BASELINE)
  assert.equal(d.ok, false)
  assert.equal(d.failures[0].rule, 'document-title')
  assert.equal(d.failures[0].size, 'desktop')
})

test('a count above the baseline fails', () => {
  const d = diffBaseline([scan('events-feed', 'mobile', [v('color-contrast', 'serious', 17), v('document-title', 'serious', 1)])], BASELINE)
  assert.equal(d.ok, false)
  assert.equal(d.failures[0].kind, 'increase')
  assert.equal(d.failures[0].baseline, 16)
  assert.equal(d.failures[0].count, 17)
})

test('a count below the baseline, or a fixed rule, passes and is listed as an improvement', () => {
  const d = diffBaseline([scan('events-feed', 'mobile', [v('color-contrast', 'serious', 3)])], BASELINE)
  assert.equal(d.ok, true)
  assert.deepEqual(d.improvements, [
    { screen: 'events-feed', size: 'mobile', rule: 'color-contrast', baseline: 16, count: 3 },
    { screen: 'events-feed', size: 'mobile', rule: 'document-title', baseline: 1, count: 0 },
  ])
  assert.match(renderMarkdown([scan('events-feed', 'mobile', [v('color-contrast', 'serious', 3)])], d), /npm run a11y:baseline/)
})

test('a screen not in the baseline fails on its serious/critical findings only', () => {
  const d = diffBaseline([scan('brand-new', 'mobile', [v('label', 'critical', 2), v('region', 'moderate', 5)])], BASELINE)
  assert.equal(d.ok, false)
  assert.equal(d.failures.length, 1)
  assert.equal(d.failures[0].rule, 'label')
  assert.equal(d.failures[0].newScreen, true)
})

test('a clean screen not in the baseline passes', () => {
  assert.equal(diffBaseline([scan('brand-new', 'mobile', [])], BASELINE).ok, true)
})

test('baseline screens that no longer exist are reported as stale, not failures', () => {
  const d = diffBaseline([scan('events-feed', 'mobile', [v('color-contrast', 'serious', 16), v('document-title', 'serious', 1)])], BASELINE, { allScreens: ['events-feed'] })
  assert.equal(d.ok, true)
  assert.deepEqual(d.stale, ['settings-badges'])
  // A partial run (no allScreens) never calls anything stale.
  assert.deepEqual(diffBaseline([], BASELINE).stale, [])
})

test('minor and moderate findings never fail, but are reported', () => {
  const d = diffBaseline([scan('settings-badges', 'mobile', [v('aria-required-attr', 'critical', 4), v('meta-viewport', 'moderate', 1), v('region', 'minor', 9)])], BASELINE)
  assert.equal(d.ok, true)
  assert.deepEqual(d.reported.map(r => r.id), ['meta-viewport', 'region'])
})

test('a failed scan fails the check', () => {
  const d = diffBaseline([scan('events-feed', 'mobile', [], ['page.goto: Timeout 30000ms exceeded'])], BASELINE)
  assert.equal(d.ok, false)
  assert.equal(d.failures[0].kind, 'scan-error')
})

test('baselineFrom keeps serious/critical counts per screen and viewport, skips failed scans, keeps unscanned screens', () => {
  const next = baselineFrom([
    scan('events-feed', 'mobile', [v('document-title', 'serious', 1), v('color-contrast', 'serious', 10), v('meta-viewport', 'moderate', 1)]),
    scan('events-feed', 'desktop', [], ['boom']),
  ], BASELINE)
  assert.deepEqual(next['events-feed'].mobile, { 'color-contrast': 10, 'document-title': 1 })
  assert.deepEqual(next['events-feed'].desktop, BASELINE['events-feed'].desktop) // failed scan: previous entry kept
  assert.deepEqual(next['settings-badges'], BASELINE['settings-badges'])
  assert.deepEqual(Object.keys(next['events-feed'].mobile), ['color-contrast', 'document-title']) // sorted, stable diffs
  // Round trip: a baseline built from a scan passes that scan.
  const results = [scan('x', 'mobile', [v('label', 'critical', 3)])]
  assert.equal(diffBaseline(results, baselineFrom(results)).ok, true)
})

test('markdown names the rule, screen, viewport, counts and help link of each failure', () => {
  const results = [scan('events-feed', 'desktop', [v('color-contrast', 'serious', 25), v('button-name', 'critical', 1), v('meta-viewport', 'moderate', 1)])]
  const md = renderMarkdown(results, diffBaseline(results, BASELINE), { axeVersion: '4.14.0', seconds: 90 })
  assert.match(md, /❌ 2 new serious\/critical findings/)
  assert.match(md, /\| `button-name` \| critical \| events-feed \(desktop\) \| 0 → 1 \| `#button-name-target` \| \[button-name help\]\(https:\/\/dequeuniversity\.com\/rules\/axe\/4\.14\/button-name\) \|/)
  assert.match(md, /\| `color-contrast` \| serious \| events-feed \(desktop\) \| 22 → 25 \|/)
  assert.match(md, /meta-viewport.*\| moderate \| 1 \| 1 \| no \(reported only\) \|/)
  assert.match(md, /axe 4\.14\.0/)
})

test('markdown for a clean run says so', () => {
  const results = [scan('events-feed', 'mobile', [v('color-contrast', 'serious', 16), v('document-title', 'serious', 1)])]
  const md = renderMarkdown(results, diffBaseline(results, BASELINE))
  assert.match(md, /✅ No new serious or critical violations · 1 screens × 1 viewports/)
  assert.doesNotMatch(md, /New violations/)
})

test('HTML report lists every violation with rule, impact, screen, viewport, target and help link, escaped', () => {
  const results = [
    scan('events-feed', 'mobile', [v('color-contrast', 'serious', 16), v('label', 'critical', 1, { target: 'input[name="<x>"]' })]),
    scan('login', 'desktop', [v('meta-viewport', 'moderate', 1)]),
  ]
  const html = renderHtml(results, diffBaseline(results, BASELINE), { axeVersion: '4.14.0', tags: ['wcag2a'] })
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /<title>vteam accessibility report<\/title>/)
  assert.match(html, /<tr class="critical new"><td><code>label<\/code> <b>new<\/b><\/td><td>critical<\/td><td>events-feed<\/td><td>mobile<\/td><td>1<\/td><td><code>input\[name=&quot;&lt;x&gt;&quot;\]<\/code><\/td><td><a href="https:\/\/dequeuniversity.com\/rules\/axe\/4.14\/label">label help<\/a><\/td><\/tr>/)
  assert.match(html, /<td>login<\/td><td>desktop<\/td>/)
  assert.doesNotMatch(html, /<x>/)
})

test('summarizeRules counts screens and nodes per rule, most severe first', () => {
  const rules = summarizeRules([
    scan('a', 'mobile', [v('color-contrast', 'serious', 2), v('label', 'critical', 1)]),
    scan('a', 'desktop', [v('color-contrast', 'serious', 3)]),
    scan('b', 'mobile', [v('color-contrast', 'serious', 1)]),
  ])
  assert.deepEqual(rules.map(r => [r.id, r.screens.size, r.nodes]), [['label', 1, 1], ['color-contrast', 2, 6]])
})

test('the committed baseline is well formed and names only known screens', () => {
  const baseline = JSON.parse(readFileSync(new URL('./a11y-baseline.json', import.meta.url), 'utf8'))
  for (const [screen, sizes] of Object.entries(baseline)) {
    assert.ok(SCREENS[screen], `${screen} is in a11y-baseline.json but not in SCREENS: run npm run a11y:baseline`)
    for (const size of Object.keys(sizes)) assert.ok(['mobile', 'desktop'].includes(size), screen)
    for (const rules of Object.values(sizes)) for (const n of Object.values(rules)) assert.ok(Number.isInteger(n) && n > 0, screen)
  }
})
