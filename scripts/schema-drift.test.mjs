import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callRpc, diffFingerprints, evaluate, isTransient, readiness } from './schema-drift.mjs'

test('identical fingerprints have no differences', () => {
  assert.deepEqual(diffFingerprints({ 'table:a': '1', 'column:a.x': '2' }, { 'column:a.x': '2', 'table:a': '1' }), [])
})

test('reports objects missing on either side and changed definitions', () => {
  const live = { 'table:a': '1', 'function:f()': 'x', 'policy:public.a.p': 'p1' }
  const beta = { 'table:a': '1', 'function:f()': 'y', 'index:a_idx': 'i' }
  assert.deepEqual(diffFingerprints(live, beta, {}), [
    { key: 'function:f()', kind: 'defined differently' },
    { key: 'index:a_idx', kind: 'only on beta' },
    { key: 'policy:public.a.p', kind: 'only on live' },
  ])
})

test('allowed differences are ignored only on the side they are allowed', () => {
  const allowed = { 'cron:kudos-reminders': 'live' }
  assert.deepEqual(diffFingerprints({ 'cron:kudos-reminders': 'c' }, {}, allowed), [])
  assert.deepEqual(diffFingerprints({}, { 'cron:kudos-reminders': 'c' }, allowed), [
    { key: 'cron:kudos-reminders', kind: 'only on beta' },
  ])
  // A changed definition is never allowed.
  assert.deepEqual(diffFingerprints({ 'cron:kudos-reminders': 'a' }, { 'cron:kudos-reminders': 'b' }, allowed), [
    { key: 'cron:kudos-reminders', kind: 'defined differently' },
  ])
})

const live = { 'table:a': '1' }
const betaAhead = { 'table:a': '1', 'table:new': 'n', 'column:new.id': 'c' }
const ledger = [{ pr: 7, migration: '20261101_new.sql', keys: ['table:new', 'column:new.id'] }]

test('an open PR may change exactly the objects its ledger entry lists', () => {
  const r = evaluate({ live, beta: betaAhead, pending: ledger, states: { 7: 'open' }, allowed: {} })
  assert.deepEqual(r.errors, [])
  assert.equal(r.notes.length, 1)
  // Anything beyond the ledger is still drift.
  const r2 = evaluate({ live, beta: { ...betaAhead, 'index:sneaky': 'x' }, pending: ledger, states: { 7: 'open' }, allowed: {} })
  assert.deepEqual(r2.errors, ['index:sneaky (only on beta)'])
})

test('a PR closed without merging must be rolled back on beta', () => {
  const r = evaluate({ live, beta: betaAhead, pending: ledger, states: { 7: 'closed' }, allowed: {} })
  assert.match(r.errors.join('\n'), /closed without merging.*rollback_pr\(7\)/)
  assert.match(r.errors.join('\n'), /table:new \(only on beta\)/)
})

test('a merged PR must reach live; once it has, only a cleanup note remains', () => {
  const notYet = evaluate({ live, beta: betaAhead, pending: ledger, states: { 7: 'merged' }, allowed: {} })
  assert.match(notYet.errors.join('\n'), /merged but its migration .* is not on live yet/)
  const done = evaluate({ live: betaAhead, beta: betaAhead, pending: ledger, states: { 7: 'merged' }, allowed: {} })
  assert.deepEqual(done.errors, [])
  assert.match(done.notes[0], /complete_pr\(7\)/)
})

test('a ledger entry for an unknown PR is an error', () => {
  const r = evaluate({ live, beta: betaAhead, pending: ledger, states: {}, allowed: {} })
  assert.match(r.errors[0], /could not be found/)
})

test('a busy database is retried; a real error is not', () => {
  assert.equal(isTransient(500, '{"code":"57014","message":"canceling statement due to statement timeout"}'), true)
  assert.equal(isTransient(504, ''), true)
  assert.equal(isTransient(404, '{"code":"PGRST202","message":"Could not find the function"}'), false)
  assert.equal(isTransient(401, 'Invalid API key'), false)
})

test('callRpc retries a statement timeout and returns the next good answer', async () => {
  const replies = [
    { ok: false, status: 500, text: async () => '{"code":"57014","message":"canceling statement due to statement timeout"}' },
    { ok: true, status: 200, json: async () => ({ 'table:a': '1' }) },
  ]
  const waits = []
  const out = await callRpc('beta', 'schema_fingerprint', { delays: [1, 2], fetchImpl: async () => replies.shift(), sleep: async (ms) => { waits.push(ms) } })
  assert.deepEqual(out, { 'table:a': '1' })
  assert.deepEqual(waits, [1])
})

test('callRpc gives up after its retries, and at once on a real error', async () => {
  const timeout = { ok: false, status: 500, text: async () => '{"code":"57014"}' }
  await assert.rejects(callRpc('beta', 'schema_fingerprint', { delays: [1, 1], fetchImpl: async () => timeout, sleep: async () => {} }), /HTTP 500/)
  let calls = 0
  const missing = { ok: false, status: 404, text: async () => '{"code":"PGRST202"}' }
  await assert.rejects(callRpc('live', 'schema_fingerprint', { delays: [1, 1], fetchImpl: async () => { calls++; return missing }, sleep: async () => {} }), /HTTP 404/)
  assert.equal(calls, 1)
})

// --ready (#245): is every migration this commit's merged PRs brought on live?
const readyLedger = [
  { pr: 301, migration: '20261201_a.sql', keys: ['table:a', 'column:a.x'] },
  { pr: 302, migration: '20261202_b.sql', keys: ['function:f()'] },
]

test('ready when the ledger is empty', () => {
  assert.deepEqual(readiness({ live: {}, beta: {}, pending: [] }), { ready: true, missing: [] })
})

test('ready when every merged PR in this commit is on live', () => {
  const fp = { 'table:a': '1', 'column:a.x': '2', 'function:f()': 'f' }
  assert.deepEqual(readiness({ live: fp, beta: fp, pending: readyLedger, merged: { 301: true, 302: true } }).ready, true)
})

test('names the merged PR and migration that live is missing', () => {
  const beta = { 'table:a': '1', 'column:a.x': '2', 'function:f()': 'f2' }
  const live = { 'table:a': '1', 'function:f()': 'f2' }
  assert.deepEqual(readiness({ live, beta, pending: readyLedger, merged: { 301: true, 302: true } }), {
    ready: false,
    missing: [{ pr: 301, migration: '20261201_a.sql', objects: 1 }],
  })
})

test('ignores open PRs, closed PRs and merges not in this commit', () => {
  const beta = { 'table:a': '1', 'function:f()': 'new' }
  const live = { 'function:f()': 'old' }
  assert.equal(readiness({ live, beta, pending: readyLedger, merged: { 301: false } }).ready, true)
  assert.equal(readiness({ live, beta, pending: readyLedger, merged: {} }).ready, true)
})

test('mergedByTree: a ledger PR is in the commit exactly when its migration file is in the tree', async () => {
  const { mergedByTree } = await import('./schema-drift.mjs')
  const pending = [
    { pr: 120, migration: '20261028203031_badge_art.sql', keys: ['table:badge_art'] },
    { pr: 264, migration: '20261113010000_user_reports.sql', keys: ['table:user_reports'] },
    { pr: 264, migration: '20261113020000_more.sql', keys: ['function:x()'] },
  ]
  const tree = new Set(['20261028203031_badge_art.sql', '20261113020000_more.sql'])
  assert.deepEqual(mergedByTree(pending, f => tree.has(f)), { 120: true, 264: true })
  assert.deepEqual(mergedByTree(pending, () => false), { 120: false, 264: false })
})

test('mergedByTree feeds readiness: an unmerged PR never blocks, a merged one missing on live does', async () => {
  const { mergedByTree } = await import('./schema-drift.mjs')
  const live = { 'table:a': '1' }
  const beta = { 'table:a': '1', 'table:b': '2' }
  const pending = [{ pr: 7, migration: 'm7.sql', keys: ['table:b'] }]
  assert.equal(readiness({ live, beta, pending, merged: mergedByTree(pending, () => false) }).ready, true)
  assert.deepEqual(readiness({ live, beta, pending, merged: mergedByTree(pending, () => true) }).missing, [{ pr: 7, migration: 'm7.sql', objects: 1 }])
})
