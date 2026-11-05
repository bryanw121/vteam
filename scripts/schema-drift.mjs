#!/usr/bin/env node
/**
 * Fails when the live and beta Supabase projects' schemas differ.
 *
 * Both projects expose public.schema_fingerprint() (migration
 * 20261026100000_schema_fingerprint.sql): an md5 per schema object (tables,
 * columns, constraints, indexes, views, functions, triggers, policies, grants,
 * realtime publication, storage buckets, cron jobs, reference-table rows). This
 * calls it on both with their public anon keys and prints every object that is
 * missing on one side or defined differently.
 *
 * Beta may run ahead of live on purpose, to test an open PR's migration: such
 * changes are applied with beta_meta.apply_pr_migration(), which records the
 * fingerprint keys they changed in a beta-only ledger (read here through
 * public.schema_pending_changes()). Those keys are allowed to differ while the
 * PR is open. Once the PR is merged its migration must be on live too; once it
 * is closed without merging, beta must be rolled back (beta_meta.rollback_pr).
 *
 * Runs in CI on every PR/push (Web build job) and daily (schema-drift.yml).
 * See CLAUDE.md, "Schema migrations".
 *
 * The anon keys are public by design (they ship in every client bundle).
 */

const PROJECTS = {
  live: {
    url: process.env.LIVE_SUPABASE_URL || 'https://rmelsdqgrpfjzqisycdl.supabase.co',
    key: process.env.LIVE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZWxzZHFncnBmanpxaXN5Y2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDU5NTYsImV4cCI6MjA4OTYyMTk1Nn0.rGzfRBxg16pC4L8YqP0PF81MDweamPzqj1Y-6zFkoDU',
  },
  beta: {
    url: process.env.BETA_SUPABASE_URL || 'https://uifolvbwtrbcmfrvelnl.supabase.co',
    key: process.env.BETA_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpZm9sdmJ3dHJiY21mcnZlbG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTUsImV4cCI6MjEwODUzMjY5NX0.8CcvfSOI3LNZ8KQ9OadOyN2dVy8lYiBeSVFzfC5ihh8',
  },
}

/**
 * Differences that are intentional. Keep this list short and explain each one.
 * Keys are fingerprint keys; the value says which project may have it alone.
 */
const ALLOWED = {
  // Sends kudos reminder notifications to real attendees; beta must never notify anyone.
  'cron:kudos-reminders': 'live',
  // Database Webhook notifications INSERT -> send-notification-push (#132). Created in the live
  // dashboard because it embeds live's service-role key and pushes to real phones; beta has no
  // push credentials and must never notify anyone.
  'trigger:public.notifications.send_notification_push': 'live',
}

async function rpc(name, fn) {
  const { url, key } = PROJECTS[name]
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`${name}: ${fn} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/** Pure: the list of differences between two fingerprints, minus ALLOWED ones. */
export function diffFingerprints(live, beta, allowed = ALLOWED) {
  const out = []
  for (const k of [...new Set([...Object.keys(live), ...Object.keys(beta)])].sort()) {
    const inLive = k in live
    const inBeta = k in beta
    if (inLive && inBeta && live[k] === beta[k]) continue
    const only = inLive && !inBeta ? 'live' : !inLive && inBeta ? 'beta' : null
    if (only && allowed[k] === only) continue
    out.push({ key: k, kind: only ? `only on ${only}` : 'defined differently' })
  }
  return out
}

const REPO = process.env.GITHUB_REPOSITORY || 'bryanw121/vteam'

/** { [pr]: 'open' | 'merged' | 'closed' | 'unknown' } for the PRs in the ledger. */
async function prStates(prs) {
  const headers = { accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const out = {}
  for (const pr of prs) {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/pulls/${pr}`, { headers, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) { out[pr] = 'unknown'; continue }
      const j = await res.json()
      out[pr] = j.merged_at ? 'merged' : j.state === 'open' ? 'open' : 'closed'
    } catch { out[pr] = 'unknown' }
  }
  return out
}

/**
 * Pure: everything wrong (errors) or worth knowing (notes) about live vs beta,
 * given beta's ledger of PR changes and those PRs' states.
 */
export function evaluate({ live, beta, pending = [], states = {}, allowed = ALLOWED }) {
  const errors = []
  const notes = []
  const owned = new Map() // fingerprint key -> PR that may change it on beta
  for (const p of pending) {
    const state = states[p.pr] ?? 'unknown'
    const differs = p.keys.filter(k => live[k] !== beta[k])
    if (state === 'open') {
      for (const k of p.keys) owned.set(k, p.pr)
      notes.push(`beta carries open PR #${p.pr}'s migration ${p.migration} (${p.keys.length} object(s))`)
    } else if (state === 'merged') {
      if (differs.length) errors.push(`PR #${p.pr} is merged but its migration ${p.migration} is not on live yet (${differs.length} object(s) differ): apply it to live, then run beta_meta.complete_pr(${p.pr}) on beta`)
      else notes.push(`PR #${p.pr} is merged and live matches: run beta_meta.complete_pr(${p.pr}) on beta to clear its ledger entry`)
    } else if (state === 'closed') {
      errors.push(`PR #${p.pr} was closed without merging but beta still has its migration ${p.migration}: run beta_meta.rollback_pr(${p.pr}) on beta`)
    } else {
      errors.push(`beta's ledger names PR #${p.pr} (${p.migration}), which could not be found: roll it back with beta_meta.rollback_pr(${p.pr}) if it is not a real PR`)
    }
  }
  const drift = diffFingerprints(live, beta, allowed).filter(d => !owned.has(d.key))
  for (const d of drift) errors.push(`${d.key} (${d.kind})`)
  return { errors, notes, drift }
}

async function main() {
  const [live, beta, pending] = await Promise.all([rpc('live', 'schema_fingerprint'), rpc('beta', 'schema_fingerprint'), rpc('beta', 'schema_pending_changes')])
  const states = await prStates([...new Set(pending.map(p => p.pr))])
  const { errors, notes } = evaluate({ live, beta, pending, states })
  for (const n of notes) console.log(`note: ${n}`)
  if (!errors.length) {
    console.log(`Schemas match: ${Object.keys(live).length} objects compared (live vs beta)${pending.length ? ', apart from the open PR changes above' : ''}.`)
    return
  }
  console.error(`Schema drift: ${errors.length} problem(s) between live and beta:`)
  for (const e of errors) console.error(`  ${e}`)
  console.error('\nSee CLAUDE.md, "Schema migrations".')
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=Schema drift::${errors.length} problem(s) between live and beta: ${errors.slice(0, 5).join(' | ')}`)
  }
  process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e.message); process.exitCode = 1 })
}
