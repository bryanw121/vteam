import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GRACE_MINUTES, judgeDeploy, metaTags, renderSummary, seriousErrors } from './production-watch.mjs'

const at = iso => Date.parse(iso)

// Nov 15 2026: #316 (8a18ba9) merged 19:26 UTC; #315's ignore step skipped every
// production build, so live still served 246c7f5 and there was no deployment.
const nov15 = {
  head: { sha: '8a18ba9c0000000000000000000000000000000a', at: '2026-11-15T19:26:33Z' },
  served: { sha: '246c7f5c0000000000000000000000000000000b' },
  behind: 2,
  deployment: null,
  schemaCheck: { status: 'completed', conclusion: 'success' },
}

test('live on main passes', () => {
  const v = judgeDeploy({ head: nov15.head, served: { sha: nov15.head.sha }, now: at('2026-11-15T22:00:00Z') })
  assert.equal(v.status, 'ok')
})

test('a short served sha still matches', () => {
  assert.equal(judgeDeploy({ head: nov15.head, served: { sha: '8a18ba9' }, now: at('2026-11-15T22:00:00Z') }).status, 'ok')
})

test('inside the grace window a new commit is only deploying', () => {
  const v = judgeDeploy({ ...nov15, now: at('2026-11-15T19:50:00Z') })
  assert.equal(v.status, 'waiting')
  assert.match(v.message, /Deploying/)
})

test('Nov 15: a skipped build fails once the grace window has passed', () => {
  const v = judgeDeploy({ ...nov15, now: at('2026-11-15T19:26:33Z') + (GRACE_MINUTES + 1) * 60000 })
  assert.equal(v.status, 'fail')
  assert.match(v.message, /no Production deployment for 8a18ba9/)
  assert.match(v.message, /live serves 246c7f5 \(2 commits behind\)/)
  assert.match(v.message, /ignoreCommand/)
})

// Nov 18 2026: d9fbd80 (#325, schema) merged 21:30 UTC; its Production build failed
// at 22:07 (the schema gate gave up); the migration reached live at 07:13 next day.
const nov18 = {
  head: { sha: 'd9fbd80c0000000000000000000000000000000c', at: '2026-11-18T21:30:45Z' },
  served: { sha: '8d51561c0000000000000000000000000000000d' },
  behind: 1,
  deployment: { state: 'failure', url: 'https://vercel.com/x/deploy', at: '2026-11-18T22:07:21Z' },
}

test('Nov 18: waits while the schema check is still waiting for the migration', () => {
  const v = judgeDeploy({ ...nov18, schemaCheck: { status: 'in_progress', conclusion: null }, now: at('2026-11-18T22:30:00Z') })
  assert.equal(v.status, 'waiting')
  assert.match(v.message, /still waiting for a migration/)
})

test('Nov 18: a failed build fails, with the log link and a redeploy hint once the migration is on live', () => {
  const v = judgeDeploy({ ...nov18, schemaCheck: { status: 'completed', conclusion: 'success' }, now: at('2026-11-19T07:20:00Z') })
  assert.equal(v.status, 'fail')
  assert.match(v.message, /Production build failed \(https:\/\/vercel.com\/x\/deploy\)/)
  assert.match(v.message, /redeploy/)
})

test('a failed schema check fails with what to do', () => {
  const v = judgeDeploy({ ...nov18, deployment: null, schemaCheck: { status: 'completed', conclusion: 'failure' }, now: at('2026-11-19T02:00:00Z') })
  assert.equal(v.status, 'fail')
  assert.match(v.message, /apply the migration on live/)
})

test('deployed but not served fails', () => {
  const v = judgeDeploy({ ...nov18, deployment: { state: 'success', at: '2026-11-18T21:36:00Z' }, schemaCheck: null, now: at('2026-11-18T23:00:00Z') })
  assert.equal(v.status, 'fail')
  assert.match(v.message, /doesn't serve it/)
})

test('a build still running is fine for a while, then fails', () => {
  const building = { ...nov18, deployment: { state: 'in_progress', at: '2026-11-18T22:00:00Z' }, schemaCheck: null }
  assert.equal(judgeDeploy({ ...building, now: at('2026-11-18T22:20:00Z') }).status, 'waiting')
  assert.equal(judgeDeploy({ ...building, now: at('2026-11-18T23:00:00Z') }).status, 'fail')
})

test('no version.json fails after the grace window and says so', () => {
  const v = judgeDeploy({ head: nov15.head, served: { sha: null, error: 'HTTP 404' }, deployment: { state: 'success', at: nov15.head.at }, now: at('2026-11-15T21:00:00Z') })
  assert.equal(v.status, 'fail')
  assert.match(v.message, /no readable version.json \(HTTP 404\)/)
})

test('metaTags reads og tags in either attribute order', () => {
  const html = '<head><meta property="og:title" content="Sand Doubles &amp; more"/><meta content="https://x/og.png" property="og:image"><meta name="twitter:card" content="summary_large_image"></head>'
  assert.deepEqual(metaTags(html), { 'og:title': 'Sand Doubles & more', 'og:image': 'https://x/og.png', 'twitter:card': 'summary_large_image' })
})

test('seriousErrors keeps crashes and hydration errors, not resource noise', () => {
  const errs = [
    'Failed to load resource: the server responded with a status of 404 ()',
    'Minified React error #418; visit https://react.dev/errors/418',
    'pageerror: TypeError: x is not a function',
  ]
  assert.deepEqual(seriousErrors(errs), errs.slice(1))
})

test('renderSummary lists every check and counts failures', () => {
  const md = renderSummary([
    { name: 'Live runs main', ok: false, detail: 'a | b' },
    { name: '/ (phone)', ok: true, detail: '14 cards' },
    { name: 'Deploy', ok: true, waiting: true, detail: 'deploying' },
  ], 'https://vteamvolleyball.com')
  assert.match(md, /\*\*1 check failed\*\*/)
  assert.match(md, /\| Live runs main \| \*\*FAIL\*\* \| a \\\| b \|/)
  assert.match(md, /\| Deploy \| waiting \|/)
})
