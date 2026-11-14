#!/usr/bin/env node
// Records a Google Sheet tournament feed (`<exec URL>?format=json`) while a tournament is played,
// for shadow mode: vteam's own tournament engine is later replayed against the recording and its
// standings, seeds and bracket compared with the Sheet's (docs: "vteam tournament creation" design).
// Read-only: GETs a public feed, writes one file per change of the feed's `stamp`. No Supabase.
//
//   node scripts/sheet-recorder.mjs --out recording --minutes 340 [--every 20] [--url <exec URL>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const out = arg('out', 'recording')
const minutes = Number(arg('minutes', '340'))
const every = Math.max(10, Number(arg('every', '20')))
// Default: the first Sheet URL in constants/liveScores.ts, so the recorder follows the app.
const url =
  arg('url') ||
  /https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.exec(readFileSync('constants/liveScores.ts', 'utf8').replace(/\/\/.*$/gm, ''))?.[0]
if (!url) throw new Error('No Sheet URL: pass --url')

mkdirSync(out, { recursive: true })
const until = Date.now() + minutes * 60_000
let last = null
let saved = 0
let failures = 0
while (Date.now() < until) {
  try {
    const res = await fetch(`${url}?format=json`, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
    const text = await res.text()
    const state = JSON.parse(text)
    if (!Array.isArray(state.matches)) throw new Error('not a scores feed')
    // `stamp` changes whenever the Sheet is written; older deployments have none, so fall back to the matches.
    const stamp = String(state.stamp ?? JSON.stringify(state.matches))
    if (stamp !== last) {
      last = stamp
      const at = new Date().toISOString()
      writeFileSync(join(out, `${at.replace(/[:.]/g, '-')}.json`), JSON.stringify({ fetched_at: at, url, state }))
      saved += 1
      const done = state.matches.filter(m => m.status === 'final').length
      console.log(`${at} saved #${saved}: ${done}/${state.matches.length} final`)
    }
  } catch (e) {
    failures += 1
    console.log(`${new Date().toISOString()} fetch failed: ${e instanceof Error ? e.message : e}`)
  }
  await new Promise(r => setTimeout(r, every * 1000))
}
console.log(`Done: ${saved} snapshots, ${failures} failed fetches`)
// A run that never got the feed is a failure worth an email; a quiet feed (nothing changed) is not.
if (saved === 0 && failures > 0) process.exit(1)
