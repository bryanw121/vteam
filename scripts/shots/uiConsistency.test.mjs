import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { baselineFrom, diffBaseline, fontTokensFrom, judge, renderMarkdown, RULES } from './lib/uiConsistency.mjs'

const tokens = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 32, 34]

test('font tokens come from constants/theme.ts', () => {
  const found = fontTokensFrom(readFileSync(new URL('../../constants/theme.ts', import.meta.url), 'utf8'))
  for (const n of [11, 12, 14, 18, 24, 34]) assert.ok(found.includes(n), `${n} is a token`)
  assert.ok(!found.includes(19))
})

test('fontTokensFrom reads only the size, heading, emoji and watermark blocks', () => {
  const src = `export const theme = {
    spacing: { md: 19 },
    font: {
      size: { xs: 11, md: 14 }, // floor
      weight: { bold: '700' },
      heading: { lg: 26 },
      emoji: { md: 40 },
    },
  }`
  assert.deepEqual(fontTokensFrom(src), [11, 14, 26, 40])
})

test('a small Back, a native title and a system font are findings', () => {
  const { counts, examples } = judge({
    backs: [{ label: 'Go back', w: 30, h: 30 }, { label: 'Back', w: 44, h: 44 }],
    nativeTitles: [{ text: 'Account settings', size: 18, family: 'system-ui' }],
    texts: [
      { text: 'Account settings', family: 'system-ui', size: 18 },
      { text: 'Username', family: 'Outfit_500Medium', size: 13 },
      { text: '', family: 'ionicons', size: 22 },
      { text: '12', family: 'Menlo', size: 13 },
    ],
    controls: [],
    docWidth: 390, viewportWidth: 390,
  }, { viewport: 'mobile', tokens })
  assert.deepEqual(counts, { 'back-control': 1, 'screen-title': 1, 'font-family': 1 })
  assert.match(examples['back-control'][0], /30×30/)
})

test('icon glyph sizes are not type tokens; off-token text sizes are', () => {
  const { counts } = judge({ texts: [{ text: 'x', family: 'ionicons', size: 23 }, { text: 'Score', family: 'Outfit_800ExtraBold', size: 96 }], docWidth: 0, viewportWidth: 0 }, { viewport: 'mobile', tokens })
  assert.deepEqual(counts, { 'font-token': 1 })
})

test('tap targets count on phones only, and never inline text links', () => {
  const m = { controls: [{ label: 'All', w: 46, h: 32 }, { label: 'Terms', w: 40, h: 18, inline: true }, { label: 'Join', w: 120, h: 44 }], docWidth: 0, viewportWidth: 0 }
  assert.deepEqual(judge(m, { viewport: 'mobile', tokens }).counts, { 'tap-target-44': 1 })
  assert.deepEqual(judge(m, { viewport: 'desktop', tokens }).counts, {})
})

test('a page wider than the viewport is a finding', () => {
  assert.deepEqual(judge({ docWidth: 420, viewportWidth: 390 }, { viewport: 'mobile', tokens }).counts, { 'page-overflow': 1 })
  assert.deepEqual(judge({ docWidth: 391, viewportWidth: 390 }, { viewport: 'mobile', tokens }).counts, {})
})

test('the baseline only lets counts stay or shrink', () => {
  const r = (screen, viewport, counts) => ({ screen, viewport, counts, examples: {} })
  const baseline = baselineFrom([r('settings', 'mobile', { 'back-control': 1, 'tap-target-44': 3 })])
  assert.deepEqual(baseline, { settings: { mobile: { 'back-control': 1, 'tap-target-44': 3 } } })

  const same = diffBaseline([r('settings', 'mobile', { 'back-control': 1, 'tap-target-44': 3 })], baseline)
  assert.equal(same.failures.length, 0)
  assert.equal(same.improved.length, 0)

  const worse = diffBaseline([r('settings', 'mobile', { 'back-control': 2, 'tap-target-44': 3 }), r('host', 'mobile', { 'screen-title': 1 })], baseline)
  assert.deepEqual(worse.failures.map(f => `${f.screen}:${f.rule}:${f.base}→${f.count}`), ['settings:back-control:1→2', 'host:screen-title:0→1'])

  const better = diffBaseline([r('settings', 'mobile', { 'tap-target-44': 1 })], baseline)
  assert.equal(better.failures.length, 0)
  assert.deepEqual(better.improved.map(i => `${i.rule}:${i.base}→${i.count}`), ['back-control:1→0', 'tap-target-44:3→1'])
})

test('a screen that did not load is not reported as improved', () => {
  const baseline = { settings: { mobile: { 'back-control': 1 } } }
  assert.equal(diffBaseline([], baseline).improved.length, 0)
})

test('the summary names the rule, screen and fix for each new finding', () => {
  const results = [{ screen: 'notifications', viewport: 'mobile', counts: { 'screen-title': 1 }, examples: { 'screen-title': ['"Notifications" 18px system-ui'] } }]
  const md = renderMarkdown({ results, diff: diffBaseline(results, {}) })
  assert.match(md, /❌ UI consistency: 1 new finding/)
  assert.match(md, /\| screen-title \| notifications \| mobile \| 1 \(0\) \|/)
  assert.ok(md.includes(RULES['screen-title']))
})
