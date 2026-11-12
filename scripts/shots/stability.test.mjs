// node --test scripts/shots/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyzeSamples, baselineFrom, confirmFailures, diffBaseline, paramMismatches, renderMarkdown, tourFindings, worseThan } from './lib/stability.mjs'
import { LINK_CASES, SCROLL_SCREENS, tourCases } from './stabilityCases.mjs'

/** A run of samples every 60 ms: splash for `splashMs`, then painted at `offsets` in turn. */
function samples({ splashMs = 120, offsets = [0], text = 2000, spinners = [] } = {}) {
  const out = []
  let t = 0
  for (; t < splashMs; t += 60) out.push({ t, y: 0, inner: 0, splash: true, painted: false, text: 0, spinners: 0 })
  offsets.forEach((y, i) => { out.push({ t, y, inner: 0, splash: false, painted: true, text: typeof text === 'function' ? text(i) : text, spinners: spinners[i] ?? 0 }); t += 60 })
  return out
}

test('a Back that paints at the remembered offset is clean', () => {
  assert.deepEqual(analyzeSamples({ samples: samples({ offsets: [900, 900, 900] }), nav: 'back', target: 900 }), [])
})

test('painting at the top, then jumping, is a jump (#250)', () => {
  const [f] = analyzeSamples({ samples: samples({ offsets: [0, 900, 900] }), nav: 'back', target: 900 })
  assert.equal(f.kind, 'back:jump')
  assert.equal(f.value, 900)
})

test('coming back at the top is not-restored (#254), not a jump', () => {
  const found = analyzeSamples({ samples: samples({ offsets: [0, 0, 0] }), nav: 'back', target: 900 })
  assert.deepEqual(found.map(f => f.kind), ['back:not-restored'])
  assert.equal(found[0].value, 900)
})

test('a reload landing at the top is fine (the scroll memory lives in memory)', () => {
  assert.deepEqual(analyzeSamples({ samples: samples({ offsets: [0, 0] }), nav: 'reload' }), [])
})

test('layout shifts: only after the splash, above the floor and without input; the value is the worst one', () => {
  const shifts = [
    { t: 30, v: 0.4, input: false, src: [] }, // under the splash
    { t: 300, v: 0.005, input: false, src: [] }, // below the floor
    { t: 400, v: 0.3, input: true, src: [] }, // the person scrolled
    { t: 500, v: 0.08, input: false, src: [{ n: '[tournaments-list] div', dy: 294, dh: -294 }] },
    { t: 700, v: 0.02, input: false, src: [] },
  ]
  const [f] = analyzeSamples({ samples: samples({ offsets: [0, 0, 0] }), shifts, nav: 'reload' })
  assert.equal(f.kind, 'reload:layout-shift')
  assert.equal(f.value, 0.08)
  assert.match(f.detail, /2 shift\(s\).*\[tournaments-list\] div moved 294 px/)
})

test('content that vanishes, and a spinner after content, are findings', () => {
  const kinds = analyzeSamples({ samples: samples({ offsets: [0, 0, 0, 0], text: i => [2000, 2000, 900, 2000][i], spinners: [0, 0, 0, 1] }), nav: 'reload' }).map(f => f.kind)
  assert.deepEqual(kinds, ['reload:content-dropped', 'reload:spinner-after-content'])
})

test('tour walks: 1..N with spotlights pass; a gap, an early end or a dark step fail (#249)', () => {
  const ok = n => Array.from({ length: n }, (_, i) => ({ n: i + 1, of: n, spot: true }))
  assert.deepEqual(tourFindings(ok(6)), [])
  assert.deepEqual(tourFindings([1, 3, 4, 5, 6].map(n => ({ n, of: 6, spot: true }))).map(f => f.kind), ['skipped-step'])
  assert.deepEqual(tourFindings(ok(6).slice(0, 4)).map(f => f.kind), ['ended-early'])
  assert.deepEqual(tourFindings(ok(6).map((s, i) => ({ ...s, spot: i !== 2 }))).map(f => f.kind), ['no-spotlight'])
  assert.deepEqual(tourFindings([]).map(f => f.kind), ['did-not-start'])
})

test('link params: kept values, changed values and absent ones', () => {
  assert.deepEqual(paramMismatches({ type: 'tournament' }, { type: 'tournament', host: null }), [])
  assert.deepEqual(paramMismatches({ host: 'ACES' }, { host: null, view: 'past' }), ['host: want (absent), got ACES', 'view: want past, got (absent)'])
})

const f = (screen, kind, value, viewport = 'desktop', caseId = 'c') => ({ check: 'scroll', screen, viewport, kind, value, caseId, detail: '' })

test('baseline: within passes, new or clearly worse fails, gone or halved is improved', () => {
  const baseline = baselineFrom([f('tournaments', 'reload:layout-shift', 0.109), f('club', 'back:not-restored', 1144), f('event', 'reload:layout-shift', 0.044)])
  const d = diffBaseline([
    f('tournaments', 'reload:layout-shift', 0.12), // noise
    f('club', 'back:not-restored', 1300), // further off than the baseline + 40 px
    f('profile', 'back:jump', 600), // new
  ], baseline)
  assert.deepEqual(d.failures.map(x => x.screen), ['club', 'profile'])
  assert.deepEqual(d.known.map(x => x.screen), ['tournaments'])
  assert.deepEqual(d.improved.map(x => x.screen), ['event'])
})

test("baseline: an entry for something this run didn't cover isn't reported as fixed", () => {
  const baseline = baselineFrom([f('club', 'back:not-restored', 1144)])
  assert.deepEqual(diffBaseline([], baseline, new Set(['scroll|events|desktop'])).improved, [])
})

test('worseThan leaves headroom for runner noise', () => {
  assert.equal(worseThan('reload:layout-shift', 0.13, 0.109), false)
  assert.equal(worseThan('reload:layout-shift', 0.2, 0.109), true)
  assert.equal(worseThan('back:not-restored', 1180, 1144), false)
  assert.equal(worseThan('link', 1, undefined), true)
})

test('a failure counts only when the re-run shows it again, at the smaller value', () => {
  const confirmed = confirmFailures([f('a', 'reload:layout-shift', 0.3, 'phone', 'x'), f('b', 'back:jump', 500)], [f('a', 'reload:layout-shift', 0.2, 'phone', 'x')])
  assert.deepEqual(confirmed.map(x => [x.screen, x.value]), [['a', 0.2]])
})

test('the summary names each new finding', () => {
  const d = diffBaseline([f('club', 'back:not-restored', 1262)], {})
  const md = renderMarkdown({ diff: d, counts: { cases: 1, tours: 0, scroll: 1, links: 0 }, seconds: 3, mode: 'PR' })
  assert.match(md, /1 new finding/)
  assert.match(md, /\| scroll \| club \| desktop \| back:not-restored \| 1262 \|/)
})

test('the committed baseline parses and holds numbers only', () => {
  const b = JSON.parse(readFileSync(new URL('./stability-baseline.json', import.meta.url), 'utf8'))
  for (const [c, screens] of Object.entries(b)) {
    if (c.startsWith('_')) continue
    for (const vps of Object.values(screens)) for (const kinds of Object.values(vps)) for (const v of Object.values(kinds)) assert.equal(typeof v, 'number')
  }
})

test('cases: PR mode is a subset of full, and screens and links are well formed', () => {
  const full = tourCases(true), pr = tourCases(false)
  assert.equal(full.length, 64)
  assert.ok(pr.length > 0 && pr.length < full.length)
  assert.ok(pr.every(c => full.some(x => JSON.stringify(x) === JSON.stringify(c))))
  for (const s of SCROLL_SCREENS) assert.match(s.path, /^\//)
  for (const c of LINK_CASES) {
    assert.match(c.path, /^\/.*\?/)
    if (c.change) assert.ok(c.after, `${c.view}: a change needs the address it leaves`)
  }
})

test('slow-server entries are only reported as improved by a run that slowed the server', () => {
  const baseline = baselineFrom([f('tournaments', 'reload:layout-shift@slow', 0.247, 'phone')])
  assert.deepEqual(diffBaseline([], baseline, new Set(['scroll|tournaments|phone'])).improved, [])
  assert.equal(diffBaseline([], baseline, new Set(['scroll|tournaments|phone', '@slow'])).improved.length, 1)
})
