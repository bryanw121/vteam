import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, renderSummary, EXPECTATIONS, MAX_FAILURES_24H } from './job-health.mjs'

const NOW = Date.parse('2026-11-10T23:40:00Z')
const ago = ms => new Date(NOW - ms).toISOString()
const MIN = 60_000

/** One healthy row per expected job for `project`. */
function healthy(project) {
  return Object.entries(EXPECTATIONS)
    .filter(([, e]) => !e.only || e.only === project)
    .map(([job]) => ({ check_name: `cron: ${job}`, ok: true, last_ok_at: ago(5 * MIN), failures_24h: 0, detail: 'active' }))
}

test('every expected job healthy passes, on live and on beta (kudos-reminders is live only)', () => {
  for (const project of ['live', 'beta']) {
    const rows = [
      ...healthy(project),
      { check_name: 'points: unpaid attendees', ok: true, last_ok_at: null, failures_24h: 0, detail: '0 attendees in 0 events' },
      { check_name: 'pg_net: responses', ok: true, last_ok_at: ago(MIN), failures_24h: 0, detail: '0 of 4 failed in 24h' },
    ]
    const out = evaluate(project, rows, { now: NOW })
    assert.deepEqual(out.filter(r => !r.ok), [], project)
  }
  assert.equal(healthy('beta').some(r => r.check_name === 'cron: kudos-reminders'), false)
})

test('a job without a recent success fails, with its age', () => {
  const rows = healthy('live').map(r => r.check_name === 'cron: award-event-points' ? { ...r, last_ok_at: ago(90 * MIN) } : r)
  const bad = evaluate('live', rows, { now: NOW }).filter(r => !r.ok)
  assert.equal(bad.length, 1)
  assert.equal(bad[0].check, 'cron: award-event-points')
  assert.match(bad[0].detail, /last success 1.5 h ago; 0 failed in 24h \(no successful run within 45 min\)/)
})

test('a job that never succeeded, an inactive job and one failing on and off all fail', () => {
  const rows = healthy('live').map(r => {
    if (r.check_name === 'cron: event-reminders') return { ...r, last_ok_at: null }
    if (r.check_name === 'cron: prune-rate-limits') return { ...r, ok: false, detail: 'inactive' }
    if (r.check_name === 'cron: ingest-schelagg-feed') return { ...r, failures_24h: MAX_FAILURES_24H }
    return r
  })
  const bad = evaluate('live', rows, { now: NOW }).filter(r => !r.ok).map(r => r.check).sort()
  assert.deepEqual(bad, ['cron: event-reminders', 'cron: ingest-schelagg-feed', 'cron: prune-rate-limits'])
})

test('a cron job with no expectation fails, and so does an expected job that is missing', () => {
  const rows = [...healthy('beta').filter(r => r.check_name !== 'cron: prune-app-events'), { check_name: 'cron: new-job', ok: true, last_ok_at: ago(MIN), failures_24h: 0 }]
  const bad = evaluate('beta', rows, { now: NOW }).filter(r => !r.ok)
  assert.deepEqual(bad.map(r => r.check).sort(), ['cron: new-job', 'cron: prune-app-events'])
  assert.match(bad.find(r => r.check === 'cron: new-job').detail, /no expectation/)
})

test('a live-only job showing up on beta has no expectation there', () => {
  const rows = [...healthy('beta'), { check_name: 'cron: kudos-reminders', ok: true, last_ok_at: ago(MIN), failures_24h: 0 }]
  assert.deepEqual(evaluate('beta', rows, { now: NOW }).filter(r => !r.ok).map(r => r.check), ['cron: kudos-reminders'])
})

test('expectations-only mode checks the job list and nothing else', () => {
  const stale = healthy('beta').map(r => ({ ...r, last_ok_at: ago(48 * 60 * MIN) }))
  const rows = [...stale, { check_name: 'points: unpaid attendees', ok: false, failures_24h: 3, detail: '3 attendees in 1 events' }]
  assert.deepEqual(evaluate('beta', rows, { now: NOW, expectationsOnly: true }), [])
  const withNew = [...rows, { check_name: 'cron: new-job', ok: true, last_ok_at: ago(MIN), failures_24h: 0 }]
  assert.deepEqual(evaluate('beta', withNew, { now: NOW, expectationsOnly: true }).map(r => r.check), ['cron: new-job'])
})

test('unpaid attendees and failing webhook calls fail; stale feeds only inform', () => {
  const rows = [
    ...healthy('live'),
    { check_name: 'points: unpaid attendees', ok: false, last_ok_at: null, failures_24h: 4, detail: '4 attendees in 2 events' },
    { check_name: 'pg_net: responses', ok: false, last_ok_at: ago(5 * 60 * MIN), failures_24h: 5, detail: '5 of 9 failed in 24h' },
    { check_name: 'feed: external_sessions', ok: true, last_ok_at: ago(30 * 60 * MIN), failures_24h: 0, detail: '64 rows' },
  ]
  const out = evaluate('live', rows, { now: NOW })
  assert.deepEqual(out.filter(r => !r.ok).map(r => r.check), ['points: unpaid attendees', 'pg_net: responses'])
  const feed = out.find(r => r.check === 'feed: external_sessions')
  assert.equal(feed.ok, true)
  assert.equal(feed.info, true)
  assert.match(feed.detail, /30\.0 h ago/)
})

test('a couple of failed webhook calls in a day do not page', () => {
  const rows = [...healthy('live'), { check_name: 'pg_net: responses', ok: false, last_ok_at: ago(MIN), failures_24h: 2, detail: '2 of 40 failed in 24h' }]
  assert.deepEqual(evaluate('live', rows, { now: NOW }).filter(r => !r.ok), [])
})

test('the summary names each failing check and how to read the error', () => {
  const md = renderSummary({
    live: [{ check: 'cron: award-event-points', ok: false, detail: 'points | after games' }],
    beta: [{ check: 'feed: external_sessions', ok: true, info: true, detail: 'newest row 5 min ago' }],
  })
  assert.match(md, /❌ 1 failing/)
  assert.match(md, /\| ❌ \| `cron: award-event-points` \| points \\\| after games \|/)
  assert.match(md, /ℹ️ \| `feed: external_sessions`/)
  assert.match(md, /cron\.job_run_details/)
  assert.match(renderSummary({ live: [] }), /✅ all healthy/)
})
