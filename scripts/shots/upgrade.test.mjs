import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deviceKeys, moveStorage, renderSummary } from './lib/upgrade.mjs'

const state = {
  cookies: [{ name: 'x', value: '1', domain: '127.0.0.1' }],
  origins: [
    { origin: 'http://127.0.0.1:4100', localStorage: [{ name: 'vteam.querySnapshot', value: '{}' }, { name: 'sb-token', value: 't' }, { name: 'vteam.feedSnapshot', value: '{}' }] },
    { origin: 'http://elsewhere.test', localStorage: [{ name: 'vteam.querySnapshot', value: '{}' }] },
  ],
}

test('storage moves to the other export\'s origin, and only the app\'s own origin goes', () => {
  const moved = moveStorage(state, 'http://127.0.0.1:4100/', 'http://127.0.0.1:4200')
  assert.deepEqual(moved.cookies, [])
  assert.equal(moved.origins.length, 1)
  assert.equal(moved.origins[0].origin, 'http://127.0.0.1:4200')
  assert.equal(moved.origins[0].localStorage.length, 3)
})

test('device keys list the app\'s keys only, sorted', () => {
  assert.deepEqual(deviceKeys(state, 'http://127.0.0.1:4100'), ['vteam.feedSnapshot', 'vteam.querySnapshot'])
  assert.deepEqual(deviceKeys(state, 'http://127.0.0.1:9999'), [])
})

test('the summary names each broken screen with what happened and the keys the device had', () => {
  const ok = renderSummary([{ ok: true }])
  assert.match(ok, /✅ 1 screens opened cleanly/)
  const bad = renderSummary([
    { ok: true },
    { ok: false, path: '/', viewport: 'phone', who: 'in', crash: 'This screen hit a snag', errors: ['TypeError: a|b'], keys: ['vteam.querySnapshot'] },
  ])
  assert.match(bad, /❌ 1 broke/)
  assert.match(bad, /\| `\/` \| phone \| signed in \| error screen: “This screen hit a snag”; TypeError: a\\\|b \| `vteam.querySnapshot` \|/)
  assert.match(bad, /Bump `VERSION`/)
})
