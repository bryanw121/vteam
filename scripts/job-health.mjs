#!/usr/bin/env node
/**
 * Background job health (#157). Points, event reminders, the Schelagg imports,
 * the nightly prune and push delivery all run inside the database on timers,
 * and when one breaks nothing shows an error: players just stop getting points
 * or reminders. This calls public.job_health() (migration
 * 20261110180000_job_health.sql: aggregates only) on live and beta with their
 * public anon keys, judges each row against EXPECTATIONS, writes a table to the
 * GitHub job summary and exits 1 on any failure. Scheduled every 3 hours by
 * job-health.yml, so a failure emails the repo owner, like schema-drift.
 *
 *   node scripts/job-health.mjs                       both projects
 *   node scripts/job-health.mjs --project beta        one project
 *   node scripts/job-health.mjs --expectations-only   only check every cron job has an expectation (CI, beta)
 *   node scripts/job-health.mjs --fixture rows.json   canned rows: { "live": [...], "beta": [...] }
 *
 * Read a failing job's error message in the SQL editor:
 *   select jobname, status, return_message, start_time
 *   from cron.job_run_details join cron.job using (jobid)
 *   order by start_time desc limit 20;
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { callRpc } from './schema-drift.mjs'

const MIN = 60_000
const HOUR = 60 * MIN

/**
 * How long each pg_cron job may go without a successful run before it counts
 * as broken: about two missed runs plus slack. A new cron job needs an entry
 * here (CI fails until it has one). `only` limits a job to one project.
 */
export const EXPECTATIONS = {
  'award-event-points': { maxAgeMs: 45 * MIN, what: 'points after games (every 15 min)' },
  'event-reminders': { maxAgeMs: 30 * MIN, what: 'event reminders (every 10 min)' },
  'ingest-schelagg-feed': { maxAgeMs: 2.5 * HOUR, what: 'outside sessions import (hourly)' },
  'ingest-schelagg-programs': { maxAgeMs: 4.5 * HOUR, what: 'leagues and tournaments import (every 2 h)' },
  'kudos-reminders': { maxAgeMs: 30 * MIN, what: 'kudos reminders (every 10 min)', only: 'live' },
  'prune-app-events': { maxAgeMs: 26 * HOUR, what: 'usage metrics rollup and prune (daily)' },
  'prune-app-online': { maxAgeMs: 26 * HOUR, what: 'online-now rollup and prune (daily)' },
  'prune-rate-limits': { maxAgeMs: 2.5 * HOUR, what: 'rate limit cleanup (hourly)' },
  'sample-app-online': { maxAgeMs: 10 * MIN, what: 'online-now sample (every minute)' },
  'vclub-maintenance-cleanup': { maxAgeMs: 26 * HOUR, what: 'maintenance cleanup (daily)' },
}

/** Failed runs in 24h that page even when the job has succeeded since (a job failing on and off). */
export const MAX_FAILURES_24H = 3
/** Failed webhook calls (pg_net, mostly push) in 24h that page. */
export const MAX_PG_NET_FAILURES_24H = 3

const age = (iso, now) => (iso ? now - Date.parse(iso) : Infinity)

export function formatAge(ms) {
  if (!Number.isFinite(ms)) return 'never'
  if (ms < HOUR) return `${Math.round(ms / MIN)} min ago`
  if (ms < 48 * HOUR) return `${(ms / HOUR).toFixed(1)} h ago`
  return `${Math.round(ms / (24 * HOUR))} days ago`
}

/**
 * Pure: judge one project's job_health() rows. Returns one result per check
 * ({ check, ok, info?, detail }). `info` rows are shown but never fail (the
 * Schelagg feeds already page through feed-freshness.yml).
 */
export function evaluate(project, rows, { now = Date.now(), expectations = EXPECTATIONS, expectationsOnly = false } = {}) {
  const out = []
  const jobs = new Set()
  for (const row of rows) {
    const name = row.check_name ?? ''
    if (name.startsWith('cron: ')) {
      const job = name.slice(6)
      jobs.add(job)
      const exp = expectations[job]
      if (!exp || (exp.only && exp.only !== project)) {
        out.push({ check: name, ok: false, detail: `no expectation for this job: add it to EXPECTATIONS in scripts/job-health.mjs` })
        continue
      }
      if (expectationsOnly) continue
      const since = age(row.last_ok_at, now)
      const problems = []
      if (row.ok === false) problems.push('inactive')
      if (since > exp.maxAgeMs) problems.push(`no successful run within ${formatAge(exp.maxAgeMs).replace(' ago', '')}`)
      if ((row.failures_24h ?? 0) >= MAX_FAILURES_24H) problems.push(`${row.failures_24h} failed runs in 24h`)
      out.push({
        check: name,
        ok: problems.length === 0,
        detail: `${exp.what}; last success ${formatAge(since)}; ${row.failures_24h ?? 0} failed in 24h${problems.length ? ` (${problems.join(', ')})` : ''}`,
      })
    } else if (expectationsOnly) {
      continue
    } else if (name.startsWith('feed: ')) {
      out.push({ check: name, ok: true, info: true, detail: `newest row ${formatAge(age(row.last_ok_at, now))}; ${row.detail ?? ''}` })
    } else if (name.startsWith('pg_net')) {
      const bad = row.failures_24h ?? 0
      out.push({ check: name, ok: bad < MAX_PG_NET_FAILURES_24H, detail: row.detail ?? `${bad} failed in 24h` })
    } else {
      out.push({ check: name, ok: row.ok !== false, detail: row.detail ?? '' })
    }
  }
  for (const [job, exp] of Object.entries(expectations)) {
    if (exp.only && exp.only !== project) continue
    if (!jobs.has(job)) out.push({ check: `cron: ${job}`, ok: false, detail: 'expected job is missing: remove it from EXPECTATIONS or restore the job' })
  }
  return out
}

/** Pure: the Markdown summary for every project's results. */
export function renderSummary(results) {
  const failed = Object.values(results).flat().filter(r => !r.ok).length
  const lines = [`## Background job health ${failed ? `❌ ${failed} failing` : '✅ all healthy'}`, '']
  for (const [project, rows] of Object.entries(results)) {
    lines.push(`### ${project}`, '', '| | Check | Detail |', '|---|---|---|')
    for (const r of rows) lines.push(`| ${r.ok ? (r.info ? 'ℹ️' : '✅') : '❌'} | \`${r.check}\` | ${String(r.detail).replace(/\|/g, '\\|')} |`)
    lines.push('')
  }
  if (failed) {
    lines.push('Read the error in the SQL editor: `select jobname, status, return_message, start_time from cron.job_run_details join cron.job using (jobid) order by start_time desc limit 20;`')
  }
  return lines.join('\n')
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++ } else args[a.slice(2)] = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const projects = args.project ? [args.project] : ['live', 'beta']
  const fixture = args.fixture ? JSON.parse(readFileSync(args.fixture, 'utf8')) : null
  const results = {}
  for (const project of projects) {
    const rows = fixture ? fixture[project] ?? [] : await callRpc(project, 'job_health')
    results[project] = evaluate(project, rows, { expectationsOnly: !!args['expectations-only'] })
  }
  const summary = renderSummary(results)
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  const failed = Object.values(results).flat().filter(r => !r.ok)
  for (const r of failed) console.log(`::error::${r.check}: ${r.detail}`)
  process.exit(failed.length ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
