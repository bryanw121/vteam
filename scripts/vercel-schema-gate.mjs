#!/usr/bin/env node
/**
 * #245: Vercel's production build waits here until live has every migration this commit's
 * merged PRs brought, so the web app never ships code that calls a table or function
 * live doesn't have yet. It does the same job as the "Live schema ready" GitHub check
 * (schema-ready.yml), but from inside the build, so no Vercel dashboard setting is needed.
 *
 * - Preview builds (and local builds) skip it.
 * - Which ledger PRs this commit contains comes from the migration files in the checkout
 *   (`schema-drift.mjs` mergedByTree): no GitHub token needed.
 * - Not ready: it polls every 2 minutes for up to GATE_MINUTES (Vercel builds time out
 *   at 45), then fails the build, so production stays on the previous deploy. Redeploy
 *   once the migration is on live.
 * - The check itself failing (network, Supabase down) never blocks a deploy: it warns
 *   and lets the build go ahead, as the app did before this gate existed.
 */
import { ready, treeResolver } from './schema-drift.mjs'

const GATE_MINUTES = Number(process.env.SCHEMA_GATE_MINUTES) || 35

export async function gate({ env = process.env, check = ready, log = console } = {}) {
  if (env.VERCEL_ENV !== 'production') {
    log.log(`Live schema gate: skipped (${env.VERCEL_ENV ? `${env.VERCEL_ENV} build` : 'not a Vercel build'}).`)
    return 0
  }
  const sha = env.VERCEL_GIT_COMMIT_SHA || 'checkout'
  const before = process.exitCode
  try {
    await check(sha, GATE_MINUTES, treeResolver())
  } catch (e) {
    process.exitCode = before
    log.warn(`Live schema gate: could not check (${e && e.message ? e.message : e}); building anyway.`)
    return 0
  }
  const failed = process.exitCode === 1
  process.exitCode = before
  if (failed) {
    log.error('Live schema gate: live is still missing a merged migration (named above). Apply it to live, then redeploy.')
    return 1
  }
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  gate().then(code => { process.exitCode = code })
}
