#!/usr/bin/env node
/**
 * Which edge functions a push to main must deploy (#172), for
 * .github/workflows/deploy-functions.yml.
 *
 *   node scripts/changed-functions.mjs <before sha> <after sha>
 *
 * Prints one function name per line. A change to `_shared/` (except the test
 * fakes), `deno.json`, `deno.lock` or `supabase/config.toml` (verify_jwt) means
 * every function; tests and READMEs deploy nothing. With no usable `before`
 * (first push, force push) every function is listed.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FUNCTIONS_DIR = 'supabase/functions'
const ALL_TRIGGERS = [`${FUNCTIONS_DIR}/deno.json`, `${FUNCTIONS_DIR}/deno.lock`, 'supabase/config.toml']

/** Pure: changed paths + the deployable function names → names to deploy (sorted). */
export function functionsToDeploy(changed, all) {
  const deployable = changed.filter(p =>
    p.startsWith(`${FUNCTIONS_DIR}/`) || p === 'supabase/config.toml')
    .filter(p => !p.endsWith('.test.ts') && !p.endsWith('README.md') && p !== `${FUNCTIONS_DIR}/_shared/testing.ts`)
  if (deployable.some(p => ALL_TRIGGERS.includes(p) || p.startsWith(`${FUNCTIONS_DIR}/_shared/`))) return [...all].sort()
  const names = new Set()
  for (const p of deployable) {
    const name = p.slice(FUNCTIONS_DIR.length + 1).split('/')[0]
    if (all.includes(name)) names.add(name)
  }
  return [...names].sort()
}

/** Folders with an index.ts. */
export function deployableFunctions(root) {
  const dir = join(root, FUNCTIONS_DIR)
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(dir, d.name, 'index.ts')))
    .map(d => d.name)
    .sort()
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [before, after = 'HEAD'] = process.argv.slice(2)
  const root = process.cwd()
  const all = deployableFunctions(root)
  let changed = null
  if (before && !/^0+$/.test(before)) {
    try {
      changed = execFileSync('git', ['diff', '--name-only', before, after], { encoding: 'utf8' }).split('\n').filter(Boolean)
    } catch { changed = null }
  }
  const names = changed ? functionsToDeploy(changed, all) : all
  if (names.length) console.log(names.join('\n'))
}
