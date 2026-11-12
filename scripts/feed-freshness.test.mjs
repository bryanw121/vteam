import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judge, newestUpdate, TABLES } from './feed-freshness.mjs'

const now = Date.parse('2026-11-09T12:00:00Z')
const [sessions, programs] = TABLES

test('passes recent rows and fails an import that has missed about three runs', () => {
  assert.equal(judge(sessions, '2026-11-09T10:25:00Z', now).ok, true)
  const late = judge(sessions, '2026-11-09T08:25:00Z', now)
  assert.equal(late.ok, false)
  assert.match(late.note, /3\.6 h old \(limit 3 h\)/)
  assert.equal(judge(programs, '2026-11-09T07:40:00Z', now).ok, true)
})

test('fails an empty table and skips one that does not exist yet', () => {
  assert.equal(judge(sessions, null, now).ok, false)
  assert.equal(judge(programs, undefined, now).ok, true)
})

test('reads the newest row through PostgREST and tells a missing table from an error', async () => {
  const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body })
  assert.equal(await newestUpdate('external_sessions', { fetch: reply(200, [{ updated_at: '2026-11-09T11:25:00Z' }]) }), '2026-11-09T11:25:00Z')
  assert.equal(await newestUpdate('external_sessions', { fetch: reply(200, []) }), null)
  assert.equal(await newestUpdate('external_programs', { fetch: reply(404, { code: 'PGRST205', message: 'not found' }) }), undefined)
  await assert.rejects(newestUpdate('external_sessions', { fetch: reply(500, { message: 'boom' }) }), /HTTP 500 boom/)
})
