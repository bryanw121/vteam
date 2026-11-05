#!/usr/bin/env node
/**
 * Fails when the edge functions deployed on the live Supabase project differ
 * from the repo (issue #172). Read-only: it never deploys anything.
 *
 * For every function it compares
 *   - the set of names: a folder under supabase/functions/ with an index.ts
 *     that is not deployed, or a deployed function with no folder;
 *   - freshness: the last commit touching the function's folder or _shared/
 *     (tests, the test fakes and READMEs excluded) must not be newer than the
 *     deployed version's updated_at;
 *   - verify_jwt: what live runs with must equal supabase/config.toml
 *     (for places-proxy and send-feedback-email that is a security setting);
 *   - status: every deployed function must be ACTIVE.
 * Each problem names the command that fixes it.
 *
 * Live functions come from the Management API
 * (GET https://api.supabase.com/v1/projects/<ref>/functions), which needs a
 * personal access token in SUPABASE_ACCESS_TOKEN. Without one the check is
 * skipped with a notice, not failed. It needs the full git history
 * (actions/checkout with fetch-depth: 0), or every function looks freshly
 * changed.
 *
 * Runs daily from .github/workflows/schema-drift.yml.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FUNCTIONS_DIR = 'supabase/functions'
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'rmelsdqgrpfjzqisycdl'

/** Files that change no deployed behaviour: a commit touching only these is not "newer than the deploy". */
const NOT_DEPLOYED = [':(exclude,glob)**/*.test.ts', ':(exclude,glob)**/README.md', `:(exclude)${FUNCTIONS_DIR}/_shared/testing.ts`]

const deployCommand = (name, ref) => `supabase functions deploy ${name} --project-ref ${ref}`

/** `[functions.<name>] verify_jwt = <bool>` from supabase/config.toml. Pure. */
export function parseVerifyJwt(toml) {
  const out = {}
  let current = null
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const section = line.match(/^\[([^\]]+)\]$/)
    if (section) {
      current = section[1].match(/^functions\.([A-Za-z0-9_-]+)$/)?.[1] ?? null
      continue
    }
    const value = line.match(/^verify_jwt\s*=\s*(true|false)$/)
    if (current && value) out[current] = value[1] === 'true'
  }
  return out
}

/** The Management API's updated_at (epoch ms as a number, or an ISO string) as epoch ms. */
export function toMillis(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) return Number(value)
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

/**
 * Pure: everything wrong (errors) or worth knowing (notes).
 *   repo: [{ name, verifyJwt (from config.toml, undefined when not declared), lastChangedAt (ISO), commit }]
 *   live: the Management API's function list
 */
export function evaluate({ repo, live, ref = PROJECT_REF }) {
  const errors = []
  const notes = []
  const liveBySlug = new Map(live.map((f) => [f.slug ?? f.name, f]))
  const repoNames = new Set(repo.map((f) => f.name))

  for (const fn of [...repo].sort((a, b) => a.name.localeCompare(b.name))) {
    const deployed = liveBySlug.get(fn.name)
    if (!deployed) {
      errors.push(`${fn.name}: in the repo but not deployed on live. Deploy it: ${deployCommand(fn.name, ref)}`)
      continue
    }
    if (deployed.status && deployed.status !== 'ACTIVE') {
      errors.push(`${fn.name}: deployed but ${deployed.status}, not ACTIVE. Redeploy it: ${deployCommand(fn.name, ref)}`)
    }
    if (fn.verifyJwt === undefined) {
      errors.push(`${fn.name}: no [functions.${fn.name}] verify_jwt in supabase/config.toml. Declare it so the deploy doesn't fall back to the default`)
    } else if (deployed.verify_jwt !== fn.verifyJwt) {
      errors.push(`${fn.name}: live runs with verify_jwt = ${deployed.verify_jwt}, supabase/config.toml says ${fn.verifyJwt}. Redeploy from main to apply config.toml: ${deployCommand(fn.name, ref)}`)
    }
    const deployedAt = toMillis(deployed.updated_at)
    const changedAt = fn.lastChangedAt ? Date.parse(fn.lastChangedAt) : null
    if (deployedAt === null) {
      errors.push(`${fn.name}: the Management API returned no usable updated_at (${JSON.stringify(deployed.updated_at)}); the check needs updating`)
    } else if (changedAt !== null && changedAt > deployedAt) {
      errors.push(`${fn.name}: changed on main at ${fn.lastChangedAt} (${fn.commit?.slice(0, 7) ?? 'unknown commit'}), after the live deploy of ${new Date(deployedAt).toISOString()} (version ${deployed.version ?? '?'}). Deploy it: ${deployCommand(fn.name, ref)}`)
    } else {
      notes.push(`${fn.name}: version ${deployed.version ?? '?'} deployed ${new Date(deployedAt).toISOString()}, last changed ${fn.lastChangedAt ?? 'never'}`)
    }
  }

  for (const slug of [...liveBySlug.keys()].sort()) {
    if (!repoNames.has(slug)) {
      errors.push(`${slug}: deployed on live but not in ${FUNCTIONS_DIR}/. Add it to the repo, or delete it: supabase functions delete ${slug} --project-ref ${ref}`)
    }
  }
  return { errors, notes }
}

export function repoFunctions() {
  const verify = parseVerifyJwt(readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8'))
  return readdirSync(join(ROOT, FUNCTIONS_DIR), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(ROOT, FUNCTIONS_DIR, d.name, 'index.ts')))
    .map((d) => {
      const out = execFileSync(
        'git',
        ['log', '-1', '--format=%H %cI', '--', `${FUNCTIONS_DIR}/${d.name}`, `${FUNCTIONS_DIR}/_shared`, ...NOT_DEPLOYED],
        { cwd: ROOT, encoding: 'utf8' },
      ).trim()
      const [commit, lastChangedAt] = out ? out.split(' ') : [null, null]
      return { name: d.name, verifyJwt: verify[d.name], lastChangedAt, commit }
    })
}

async function liveFunctions(token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Management API: list functions HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  if (!Array.isArray(body)) throw new Error('Management API: list functions did not return an array')
  return body
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    const msg = 'SUPABASE_ACCESS_TOKEN is not set, so live edge functions were not compared with the repo. Add a Supabase personal access token as that repository secret to turn the check on.'
    console.log(process.env.GITHUB_ACTIONS ? `::notice title=Edge function drift skipped::${msg}` : `skipped: ${msg}`)
    return
  }
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim()
  if (shallow === 'true') throw new Error('shallow clone: check out with fetch-depth: 0 so the last change to each function is known')

  const { errors, notes } = evaluate({ repo: repoFunctions(), live: await liveFunctions(token) })
  for (const n of notes) console.log(`ok: ${n}`)
  if (!errors.length) {
    console.log(`Edge functions match: ${notes.length} function(s) on ${PROJECT_REF} are current with the repo.`)
    return
  }
  console.error(`Edge function drift: ${errors.length} problem(s) between live and the repo:`)
  for (const e of errors) console.error(`  ${e}`)
  console.error('\nSee supabase/functions/README.md, "Deploying".')
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=Edge function drift::${errors.length} problem(s): ${errors.slice(0, 5).join(' | ')}`)
  }
  process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
}
