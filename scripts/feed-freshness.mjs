#!/usr/bin/env node
// Is vteam's copy of Schelagg's data still being refreshed? (CLAUDE.md, "Sessions from other
// Austin venues" and "Leagues and tournaments run elsewhere".)
//
// The imports (pg_cron: ingest_schelagg_feed hourly, ingest_schelagg_programs every 2 hours)
// rewrite `updated_at` on every row they keep. If the newest row is older than a few runs, an
// import has stopped (or Schelagg stopped publishing, and the import is rightly skipping a stale
// feed). The app then hides the rows, so the schedule silently looks empty: this check fails
// instead, and GitHub emails the owner about the failed scheduled run.
//
// Reads live with its public anon key (the same one the app ships), never writes.
//   node scripts/feed-freshness.mjs            check live
//   node scripts/feed-freshness.mjs --json     print the findings as JSON as well
import { pathToFileURL } from 'node:url'

export const LIVE = {
  url: process.env.LIVE_SUPABASE_URL || 'https://rmelsdqgrpfjzqisycdl.supabase.co',
  key: process.env.LIVE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZWxzZHFncnBmanpxaXN5Y2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDU5NTYsImV4cCI6MjA4OTYyMTk1Nn0.rGzfRBxg16pC4L8YqP0PF81MDweamPzqj1Y-6zFkoDU',
}

/** Each mirrored table and how old its newest row may be: three missed runs. */
export const TABLES = [
  { table: 'external_sessions', job: 'ingest-schelagg-feed (hourly at :25)', maxAgeHours: 3 },
  { table: 'external_programs', job: 'ingest-schelagg-programs (every 2 hours at :40)', maxAgeHours: 6 },
]

/** One finding per table from its newest `updated_at` (null: empty table; missing: not created yet). */
export function judge(spec, newest, now = Date.now()) {
  if (newest === undefined) return { ...spec, ok: true, note: `${spec.table} doesn't exist yet; skipped.` }
  if (newest === null) return { ...spec, ok: false, note: `${spec.table} is empty: ${spec.job} has never written a row.` }
  const hours = (now - Date.parse(newest)) / 3_600_000
  if (!Number.isFinite(hours)) return { ...spec, ok: false, note: `${spec.table}: couldn't read updated_at (${newest}).` }
  const age = hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`
  return hours <= spec.maxAgeHours
    ? { ...spec, ok: true, hours, note: `${spec.table}: newest row ${age} old.` }
    : { ...spec, ok: false, hours, note: `${spec.table}: newest row is ${age} old (limit ${spec.maxAgeHours} h). ${spec.job} has stopped, or Schelagg stopped publishing. Check cron.job_run_details on live and the Schelagg scrape runs.` }
}

/** The newest `updated_at` in a table: a string, null when empty, undefined when the table doesn't exist. */
export async function newestUpdate(table, { fetch: f = globalThis.fetch, project = LIVE } = {}) {
  const res = await f(`${project.url}/rest/v1/${table}?select=updated_at&order=updated_at.desc&limit=1`, {
    headers: { apikey: project.key, Authorization: `Bearer ${project.key}` },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // PostgREST: PGRST205 / 42P01 when the table isn't in the schema (yet).
    if (body && (body.code === 'PGRST205' || body.code === '42P01')) return undefined
    throw new Error(`${table}: HTTP ${res.status} ${body?.message ?? ''}`.trim())
  }
  return Array.isArray(body) && body.length ? body[0].updated_at : null
}

async function main() {
  const findings = []
  for (const spec of TABLES) {
    try { findings.push(judge(spec, await newestUpdate(spec.table))) }
    catch (e) { findings.push({ ...spec, ok: false, note: `${spec.table}: ${e.message}` }) }
  }
  for (const f of findings) console.log(`${f.ok ? 'ok  ' : 'FAIL'} ${f.note}`)
  if (process.argv.includes('--json')) console.log(JSON.stringify(findings, null, 2))
  if (findings.some((f) => !f.ok)) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
