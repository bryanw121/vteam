import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSha, writeBuildVersion } from './build-version.mjs'

const SHA = '0fcc79b0123456789abcdef0123456789abcdef0'

test('takes Vercel\'s commit first, then GitHub\'s, then git', () => {
  assert.equal(buildSha({ VERCEL_GIT_COMMIT_SHA: SHA, GITHUB_SHA: 'aaaaaaa' }, () => 'bbbbbbb'), SHA)
  assert.equal(buildSha({ GITHUB_SHA: 'aaaaaaa' }, () => 'bbbbbbb'), 'aaaaaaa')
  assert.equal(buildSha({}, () => 'bbbbbbb'), 'bbbbbbb')
})

test('ignores values that are not commits', () => {
  assert.equal(buildSha({ VERCEL_GIT_COMMIT_SHA: '', GITHUB_SHA: 'main' }, () => null), 'unknown')
  assert.equal(buildSha({ VERCEL_GIT_COMMIT_SHA: '<script>' }, () => 'not a sha'), 'unknown')
})

test('writes version.json into the export', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'bv-'))
  const now = new Date('2026-11-23T20:00:00Z')
  await writeBuildVersion(dist, { env: { VERCEL_GIT_COMMIT_SHA: SHA }, git: () => null, now })
  assert.deepEqual(JSON.parse(await readFile(join(dist, 'version.json'), 'utf8')), { sha: SHA, builtAt: '2026-11-23T20:00:00.000Z' })
})
