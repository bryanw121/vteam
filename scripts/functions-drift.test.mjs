import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluate, parseVerifyJwt, toMillis } from './functions-drift.mjs'

// Fixture rows shaped like GET /v1/projects/{ref}/functions (Management API).
const apiRow = (slug, over = {}) => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  status: 'ACTIVE',
  version: 7,
  created_at: 1761000000000,
  updated_at: Date.parse('2026-11-02T10:00:00Z'),
  verify_jwt: false,
  import_map: false,
  entrypoint_path: `file:///src/supabase/functions/${slug}/index.ts`,
  ...over,
})
const repoFn = (name, over = {}) => ({ name, verifyJwt: false, lastChangedAt: '2026-11-01T09:00:00Z', commit: 'abc1234def', ...over })

test('in sync: no errors, one note per function', () => {
  const r = evaluate({
    repo: [repoFn('send-chat-push'), repoFn('places-proxy', { verifyJwt: true })],
    live: [apiRow('send-chat-push'), apiRow('places-proxy', { verify_jwt: true })],
    ref: 'ref123',
  })
  assert.deepEqual(r.errors, [])
  assert.equal(r.notes.length, 2)
})

test('stale deploy: the repo changed after the live version, with the deploy command', () => {
  const r = evaluate({ repo: [repoFn('send-chat-push', { lastChangedAt: '2026-11-03T08:00:00Z' })], live: [apiRow('send-chat-push')], ref: 'ref123' })
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0], /^send-chat-push: changed on main at 2026-11-03T08:00:00Z \(abc1234\), after the live deploy of 2026-11-02T10:00:00.000Z/)
  assert.match(r.errors[0], /supabase functions deploy send-chat-push --project-ref ref123$/)
})

test('verify_jwt mismatch is an error in either direction', () => {
  const off = evaluate({ repo: [repoFn('places-proxy', { verifyJwt: true })], live: [apiRow('places-proxy', { verify_jwt: false })] })
  assert.equal(off.errors.length, 1)
  assert.match(off.errors[0], /places-proxy: live runs with verify_jwt = false, supabase\/config\.toml says true/)
  const on = evaluate({ repo: [repoFn('send-chat-push', { verifyJwt: false })], live: [apiRow('send-chat-push', { verify_jwt: true })] })
  assert.match(on.errors[0], /verify_jwt = true, supabase\/config\.toml says false/)
})

test('a function missing from config.toml is an error', () => {
  const r = evaluate({ repo: [repoFn('new-fn', { verifyJwt: undefined })], live: [apiRow('new-fn')] })
  assert.match(r.errors[0], /no \[functions\.new-fn\] verify_jwt/)
})

test('missing on live and extra on live', () => {
  const r = evaluate({ repo: [repoFn('send-chat-push'), repoFn('send-feedback-email')], live: [apiRow('send-chat-push'), apiRow('old-hello')], ref: 'ref123' })
  assert.deepEqual(r.errors, [
    'send-feedback-email: in the repo but not deployed on live. Deploy it: supabase functions deploy send-feedback-email --project-ref ref123',
    'old-hello: deployed on live but not in supabase/functions/. Add it to the repo, or delete it: supabase functions delete old-hello --project-ref ref123',
  ])
})

test('a function that is not ACTIVE is an error', () => {
  const r = evaluate({ repo: [repoFn('send-chat-push')], live: [apiRow('send-chat-push', { status: 'THROTTLED' })] })
  assert.match(r.errors[0], /deployed but THROTTLED/)
})

test('updated_at as an ISO string or digit string works; garbage is reported', () => {
  assert.equal(toMillis('2026-11-02T10:00:00Z'), Date.parse('2026-11-02T10:00:00Z'))
  assert.equal(toMillis('1762077600000'), 1762077600000)
  assert.equal(toMillis(undefined), null)
  const ok = evaluate({ repo: [repoFn('a')], live: [apiRow('a', { updated_at: '2026-11-02T10:00:00Z' })] })
  assert.deepEqual(ok.errors, [])
  const bad = evaluate({ repo: [repoFn('a')], live: [apiRow('a', { updated_at: 'soon' })] })
  assert.match(bad.errors[0], /no usable updated_at/)
})

test('parseVerifyJwt reads every [functions.*] section and ignores comments', () => {
  assert.deepEqual(
    parseVerifyJwt('project_id = "x"\n# [functions.commented]\n[functions.a]\nverify_jwt = false # why\n\n[functions.b]\nverify_jwt = true\n[api]\nverify_jwt = false\n'),
    { a: false, b: true },
  )
})

test('the real config.toml declares verify_jwt for the six functions', () => {
  const v = parseVerifyJwt(readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8'))
  assert.deepEqual(v, {
    'send-chat-push': false,
    'send-notification-push': false,
    'check-push-receipts': false,
    'places-proxy': true,
    'send-feedback-email': true,
    // Callers are signed out (#102).
    'login-with-username': false,
  })
})
