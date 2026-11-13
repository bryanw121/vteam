import { test } from 'node:test'
import assert from 'node:assert/strict'
import { functionsToDeploy } from './changed-functions.mjs'

const ALL = ['places-proxy', 'send-chat-push', 'send-notification-push']

test('one function folder deploys that function', () => {
  assert.deepEqual(functionsToDeploy(['supabase/functions/send-chat-push/handler.ts', 'app/index.tsx'], ALL), ['send-chat-push'])
})

test('_shared, deno config and config.toml deploy everything', () => {
  for (const p of ['supabase/functions/_shared/webhookAuth.ts', 'supabase/functions/deno.lock', 'supabase/config.toml']) {
    assert.deepEqual(functionsToDeploy([p], ALL), ALL)
  }
})

test('tests, READMEs and the test fakes deploy nothing', () => {
  assert.deepEqual(functionsToDeploy([
    'supabase/functions/send-chat-push/handler.test.ts',
    'supabase/functions/README.md',
    'supabase/functions/_shared/testing.ts',
  ], ALL), [])
})

test('unknown folders and app code are ignored', () => {
  assert.deepEqual(functionsToDeploy(['supabase/functions/old-thing/index.ts', 'supabase/migrations/x.sql'], ALL), [])
})
