#!/usr/bin/env node
/**
 * Server headroom watch (#290). Live froze for 3 h 40 min on 2026-11-12 because
 * its committed memory went past the kernel's commit limit (see the Vteam project
 * doc "outage-2026-11-12-root-cause"), after sitting just under it for a week.
 * Nothing in the app or in job-health.yml can see that coming: job_health()
 * needs the database to answer, and it runs every 3 hours.
 *
 * Every 30 minutes (server-health.yml) this:
 * - probes live's REST API with the public anon key (one tiny read of
 *   app_config), twice if the first try fails, so a frozen server is noticed
 *   within half an hour;
 * - when the SUPABASE_METRICS_KEY secret is set (a dedicated Secret API key,
 *   sb_secret_...), reads Supabase's Prometheus Metrics API
 *   (https://supabase.com/docs/guides/observability/metrics) and judges memory
 *   commitment, available RAM, swap, disk and connections against HEADROOM.
 *   A metric that is missing fails the run, so a renamed series never passes
 *   silently. Without the secret the metrics part is skipped with a notice.
 *
 * Writes a table to the GitHub job summary and headroom.json, and exits 1 on
 * any failure, so GitHub emails the repo owner (like job-health and schema-drift).
 *
 *   node scripts/server-health.mjs                         live
 *   node scripts/server-health.mjs --project beta          beta (needs BETA_SUPABASE_METRICS_KEY for metrics)
 *   node scripts/server-health.mjs --metrics-file m.txt    judge a saved Prometheus payload (no network for metrics)
 *   node scripts/server-health.mjs --retry-wait 0          don't wait between probe tries (local runs)
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { PROJECTS } from './schema-drift.mjs'

const GB = 1024 ** 3

/**
 * Limits. `warn` and `fail` both fail the run (a failed run is the only alert
 * channel); the summary says which. Ratios are 0–1.
 * - commit: Committed_AS / CommitLimit. Past 1 the kernel refuses new memory and
 *   Postgres can't start connections or cron workers (the 11-12 freeze). Above
 *   0.8 for long: move up a compute size.
 */
export const HEADROOM = {
  commit: { warn: 0.8, fail: 0.9, what: 'memory commitment (committed / commit limit)' },
  ramAvailable: { warnBelow: 0.1, failBelow: 0.05, what: 'RAM available' },
  swap: { warn: 0.7, fail: 0.9, what: 'swap used' },
  disk: { warn: 0.8, fail: 0.9, what: 'database disk used' },
  connections: { warn: 0.8, fail: 0.9, what: 'connections (backends / max_connections)' },
  probeMs: { warn: 10_000, what: 'REST probe' },
}
export const PROBE_TIMEOUT_MS = 20_000

/**
 * Pure: Prometheus text format → Map(name → [{ labels, value }]). Comments,
 * blank lines and unparsable values are skipped.
 */
export function parsePrometheus(text) {
  const out = new Map()
  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(\S+)(\s+\d+)?$/)
    if (!m) continue
    const value = Number(m[4])
    if (!Number.isFinite(value)) continue
    const labels = {}
    for (const l of (m[3] ?? '').matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) labels[l[1]] = l[2]
    if (!out.has(m[1])) out.set(m[1], [])
    out.get(m[1]).push({ labels, value })
  }
  return out
}

const first = (metrics, name) => metrics.get(name)?.[0]?.value
const sum = (metrics, name) => metrics.get(name)?.reduce((a, s) => a + s.value, 0)

/** The database's data disk: the /data mount if there is one, else the largest real filesystem. */
function dataDisk(metrics) {
  const sizes = (metrics.get('node_filesystem_size_bytes') ?? []).filter(s => s.value > 0 && !/tmpfs|overlay|squashfs/.test(s.labels.fstype ?? ''))
  if (!sizes.length) return null
  const pick = sizes.find(s => s.labels.mountpoint === '/data') ?? sizes.reduce((a, b) => (b.value > a.value ? b : a))
  const avail = (metrics.get('node_filesystem_avail_bytes') ?? []).find(s => s.labels.mountpoint === pick.labels.mountpoint && s.labels.device === pick.labels.device)
  return avail ? { used: 1 - avail.value / pick.value, size: pick.value, mount: pick.labels.mountpoint } : null
}

const pct = r => `${Math.round(r * 100)}%`
const gb = b => `${(b / GB).toFixed(2)} GB`

function level(value, { warn, fail }) {
  if (fail != null && value >= fail) return 'fail'
  if (warn != null && value >= warn) return 'warn'
  return 'ok'
}

/**
 * Pure: judge a parsed metrics payload. One result per check:
 * { check, status: 'ok' | 'warn' | 'fail', detail }.
 */
export function judgeMetrics(metrics, limits = HEADROOM) {
  const out = []
  const missing = names => names.filter(n => !metrics.has(n))

  const commitNames = ['node_memory_Committed_AS_bytes', 'node_memory_CommitLimit_bytes']
  if (missing(commitNames).length) out.push({ check: 'memory commitment', status: 'fail', detail: `metric missing: ${missing(commitNames).join(', ')}` })
  else {
    const used = first(metrics, commitNames[0]), cap = first(metrics, commitNames[1])
    const r = used / cap
    out.push({ check: 'memory commitment', status: level(r, limits.commit), detail: `${pct(r)}: ${gb(used)} of ${gb(cap)} (${limits.commit.what}; warn ${pct(limits.commit.warn)}, fail ${pct(limits.commit.fail)}). Past 100% the server stops starting connections and jobs: move up a compute size.` })
  }

  const ramNames = ['node_memory_MemAvailable_bytes', 'node_memory_MemTotal_bytes']
  if (missing(ramNames).length) out.push({ check: 'RAM available', status: 'fail', detail: `metric missing: ${missing(ramNames).join(', ')}` })
  else {
    const avail = first(metrics, ramNames[0]), total = first(metrics, ramNames[1])
    const r = avail / total
    const { warnBelow, failBelow } = limits.ramAvailable
    out.push({ check: 'RAM available', status: r < failBelow ? 'fail' : r < warnBelow ? 'warn' : 'ok', detail: `${pct(r)}: ${gb(avail)} of ${gb(total)}` })
  }

  const swapNames = ['node_memory_SwapTotal_bytes', 'node_memory_SwapFree_bytes']
  if (missing(swapNames).length) out.push({ check: 'swap', status: 'fail', detail: `metric missing: ${missing(swapNames).join(', ')}` })
  else {
    const total = first(metrics, swapNames[0]), free = first(metrics, swapNames[1])
    const r = total > 0 ? (total - free) / total : 0
    out.push({ check: 'swap', status: total > 0 ? level(r, limits.swap) : 'ok', detail: total > 0 ? `${pct(r)} used: ${gb(total - free)} of ${gb(total)}` : 'no swap' })
  }

  const disk = dataDisk(metrics)
  if (!disk) out.push({ check: 'disk', status: 'fail', detail: 'metric missing: node_filesystem_size_bytes / node_filesystem_avail_bytes' })
  else out.push({ check: 'disk', status: level(disk.used, limits.disk), detail: `${pct(disk.used)} used of ${gb(disk.size)} (${disk.mount})` })

  const connNames = ['pg_stat_database_num_backends', 'pg_settings_max_connections']
  if (missing(connNames).length) out.push({ check: 'connections', status: 'fail', detail: `metric missing: ${missing(connNames).join(', ')}` })
  else {
    const used = sum(metrics, connNames[0]), max = first(metrics, connNames[1])
    const r = used / max
    out.push({ check: 'connections', status: level(r, limits.connections), detail: `${pct(r)}: ${used} of ${max}` })
  }
  return out
}

/** Pure: judge the probe tries ([{ ok, status, ms, error? }]). Fails only when every try failed. */
export function judgeProbe(tries, limits = HEADROOM) {
  const describe = t => (t.ok ? `HTTP ${t.status} in ${t.ms} ms` : t.error ? `${t.error} after ${t.ms} ms` : `HTTP ${t.status} in ${t.ms} ms`)
  if (!tries.some(t => t.ok)) return { check: 'REST probe', status: 'fail', detail: `not answering: ${tries.map(describe).join('; then ')}` }
  const ok = tries.find(t => t.ok)
  const note = tries.length > 1 ? ` (first try: ${describe(tries[0])})` : ''
  return { check: 'REST probe', status: ok.ms >= limits.probeMs.warn ? 'warn' : 'ok', detail: `${describe(ok)}${note}` }
}

/** Pure: the Markdown summary. `secret` is redacted from everything, just in case. */
export function renderSummary(project, results, { metricsSkipped = false, secret = '' } = {}) {
  const bad = results.filter(r => r.status !== 'ok')
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' }
  const lines = [`## Server headroom: ${project} ${bad.length ? `❌ ${bad.length} over the line` : '✅ all within limits'}`, '', '| | Check | Detail |', '|---|---|---|']
  for (const r of results) lines.push(`| ${icon[r.status]} | ${r.check} | ${String(r.detail).replace(/\|/g, '\\|')} |`)
  if (metricsSkipped) lines.push('', 'Memory, disk and connections were not checked: add a dedicated Supabase Secret API key as the repository secret `SUPABASE_METRICS_KEY` (Project Settings → API Keys).')
  const text = lines.join('\n')
  return secret ? text.split(secret).join('***') : text
}

async function probeOnce(url, key) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${url}/rest/v1/app_config?select=min_version&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    await res.text()
    return { ok: res.ok, status: res.status, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: e?.name === 'TimeoutError' ? 'timed out' : String(e?.message ?? e) }
  }
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
  const project = args.project ?? 'live'
  const { url, key } = PROJECTS[project]
  const secret = (project === 'live' ? process.env.SUPABASE_METRICS_KEY : process.env.BETA_SUPABASE_METRICS_KEY) ?? ''
  const retryWait = Number(args['retry-wait'] ?? 60_000)

  const results = []
  let metricsSkipped = false
  if (args['metrics-file']) {
    results.push(...judgeMetrics(parsePrometheus(readFileSync(args['metrics-file'], 'utf8'))))
  } else if (secret) {
    try {
      const res = await fetch(`${url}/customer/v1/privileged/metrics`, {
        headers: { Authorization: `Basic ${Buffer.from(`service_role:${secret}`).toString('base64')}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (!res.ok) results.push({ check: 'metrics API', status: 'fail', detail: `HTTP ${res.status}${res.status === 401 ? ': the SUPABASE_METRICS_KEY secret was rejected (rotated?)' : ''}` })
      else results.push(...judgeMetrics(parsePrometheus(await res.text())))
    } catch (e) {
      results.push({ check: 'metrics API', status: 'fail', detail: `not answering: ${e?.name === 'TimeoutError' ? 'timed out' : e?.message ?? e}` })
    }
  } else {
    metricsSkipped = true
    console.log('::notice::No SUPABASE_METRICS_KEY secret: memory, disk and connections not checked (REST probe only).')
  }

  const tries = [await probeOnce(url, key)]
  if (!tries[0].ok) {
    await new Promise(r => setTimeout(r, retryWait))
    tries.push(await probeOnce(url, key))
  }
  results.push(judgeProbe(tries))

  const summary = renderSummary(project, results, { metricsSkipped, secret })
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  writeFileSync('headroom.json', JSON.stringify({ project, at: new Date().toISOString(), results }, null, 2))
  const failed = results.filter(r => r.status !== 'ok')
  for (const r of failed) console.log(`::error::${r.check}: ${String(r.detail).split(secret || '\u0000').join('***')}`)
  process.exit(failed.length ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
