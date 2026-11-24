#!/usr/bin/env node
/**
 * After `expo export` (#353): write `<dist>/version.json`, the commit this web
 * build was made from, so anyone (and scripts/production-watch.mjs) can ask the
 * live site which build it serves:
 *
 *   { "sha": "<full commit sha>", "builtAt": "<ISO time>" }
 *
 * The commit comes from VERCEL_GIT_COMMIT_SHA (Vercel builds), else GITHUB_SHA
 * (CI), else `git rev-parse HEAD`, else "unknown". A static file outside the app
 * tree, so it can't affect hydration; vercel.json serves it from the filesystem
 * before the SPA fallback.
 *
 *   node scripts/build-version.mjs --dist dist
 *   node scripts/build-version.mjs --print   # just the sha (build:web inlines it as EXPO_PUBLIC_BUILD_SHA, #359)
 */
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA_RE = /^[0-9a-f]{7,40}$/

/** Pure: the build's commit from the environment (or a git fallback). */
export function buildSha(env = process.env, git = gitHead) {
  for (const v of [env.VERCEL_GIT_COMMIT_SHA, env.GITHUB_SHA]) {
    if (v && SHA_RE.test(v.trim())) return v.trim()
  }
  const head = git()
  return head && SHA_RE.test(head) ? head : 'unknown'
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

export async function writeBuildVersion(dist, { env = process.env, git = gitHead, now = new Date() } = {}) {
  const body = { sha: buildSha(env, git), builtAt: now.toISOString() }
  await writeFile(join(dist, 'version.json'), `${JSON.stringify(body)}\n`)
  return body
}

if (import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--print')) {
  // `npm run build:web` inlines it as EXPO_PUBLIC_BUILD_SHA, so the app knows its own build (#359).
  const sha = buildSha()
  process.stdout.write(sha === 'unknown' ? '' : sha)
} else if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--dist')
  const dist = resolve(i > 0 ? process.argv[i + 1] : 'dist')
  const body = await writeBuildVersion(dist)
  console.log(`version.json: ${body.sha}`)
}
