import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gate } from './vercel-schema-gate.mjs'

const quiet = { log() {}, warn() {}, error() {} }

test('preview and local builds skip the gate without checking', async () => {
  let called = false
  const check = async () => { called = true }
  assert.equal(await gate({ env: { VERCEL_ENV: 'preview' }, check, log: quiet }), 0)
  assert.equal(await gate({ env: {}, check, log: quiet }), 0)
  assert.equal(called, false)
})

test('production passes when live has every merged migration', async () => {
  let args
  const check = async (...a) => { args = a }
  assert.equal(await gate({ env: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abc1234' }, check, log: quiet }), 0)
  assert.equal(args[0], 'abc1234')
  assert.equal(typeof args[2], 'function')
})

test('production fails the build when live is still missing a migration after the wait', async () => {
  const check = async () => { process.exitCode = 1 }
  assert.equal(await gate({ env: { VERCEL_ENV: 'production' }, check, log: quiet }), 1)
  assert.equal(process.exitCode, undefined)
})

test('a check that cannot run never blocks the deploy', async () => {
  const check = async () => { throw new Error('fetch failed') }
  assert.equal(await gate({ env: { VERCEL_ENV: 'production' }, check, log: quiet }), 0)
  assert.equal(process.exitCode, undefined)
})
