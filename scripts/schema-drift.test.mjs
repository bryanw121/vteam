import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffFingerprints, evaluate } from './schema-drift.mjs'

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
