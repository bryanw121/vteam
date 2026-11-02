#!/usr/bin/env node
/**
 * Generate badge art with the admin-only `generate-badge-art` edge function (#10).
 *
 * Builds each tier spec from the badge catalog in constants/badges.ts (title,
 * description, tier label, tier colour, category gradient), signs in as an
 * admin and calls the function once per tier. The function generates the PNG,
 * stores it in the `badges` bucket and records it in `badge_art`; the app
 * picks it up within an hour (STALE.badgeArt) or on the next launch.
 *
 * Usage (Node 22.18+, which runs the TypeScript catalog directly; or `npx tsx scripts/generate-badge-art.mjs ...`):
 *   node scripts/generate-badge-art.mjs serve_cheer 2     one tier
 *   node scripts/generate-badge-art.mjs serve_cheer       every tier of a badge
 *   node scripts/generate-badge-art.mjs --missing         every tier with no generated art yet
 *   add --dry-run to print the prompts without generating anything (no cost)
 *
 * Environment (a .env in the repo root is read if present):
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY   the project to write to
 *   BADGE_ADMIN_EMAIL, BADGE_ADMIN_PASSWORD                   an admin account, or
 *   BADGE_ADMIN_TOKEN                                         an admin's access token
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Pure: the request bodies for the selected tiers.
 * `catalog` = { defs, title(type), tierColor(def, tier), gradients }.
 * `only` = { badge?, tier?, skip? } where skip is a Set of 'badge:tier' already generated.
 */
export function tierSpecs(catalog, only = {}) {
  const { defs, title, tierColor, gradients } = catalog
  const specs = []
  for (const def of defs) {
    if (only.badge && def.type !== only.badge) continue
    const palette = gradients[def.type]
    if (!palette) continue
    for (const t of def.tiers) {
      if (only.tier && t.tier !== only.tier) continue
      if (only.skip?.has(`${def.type}:${t.tier}`)) continue
      specs.push({
        badge: def.type,
        title: title(def.type),
        description: def.description,
        tier: t.tier,
        tierName: t.label,
        maxTier: def.tiers.length,
        accent: tierColor(def, t.tier),
        palette: [palette[0], palette[1]],
      })
    }
  }
  return specs
}

/** Pure: parses argv into { badge, tier, missing, dryRun } or { error }. */
export function parseArgs(argv) {
  const flags = new Set(argv.filter(a => a.startsWith('--')))
  const rest = argv.filter(a => !a.startsWith('--'))
  for (const f of flags) if (!['--missing', '--dry-run'].includes(f)) return { error: `unknown flag ${f}` }
  const missing = flags.has('--missing')
  const [badge, tierArg] = rest
  if (!missing && !badge) return { error: 'name a badge (and optionally a tier), or pass --missing' }
  if (missing && badge) return { error: '--missing takes no badge' }
  const tier = tierArg === undefined ? undefined : Number(tierArg)
  if (tier !== undefined && !(Number.isInteger(tier) && tier >= 1)) return { error: `bad tier ${tierArg}` }
  return { badge, tier, missing, dryRun: flags.has('--dry-run') }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) {
    console.error(`${args.error}\nusage: node scripts/generate-badge-art.mjs <badge> [tier] | --missing  [--dry-run]`)
    process.exit(2)
  }
  if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'))
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY')

  let badges
  try {
    badges = await import(join(ROOT, 'constants/badges.ts'))
  } catch (err) {
    throw new Error(`could not load constants/badges.ts (needs Node 22.18+ or tsx): ${err.message}`)
  }
  const catalog = {
    defs: badges.BADGE_DEFINITIONS,
    title: badges.badgeTitle,
    tierColor: badges.badgeTierColor,
    gradients: badges.BADGE_CATEGORY_GRADIENTS,
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let token = process.env.BADGE_ADMIN_TOKEN
  if (!token) {
    const email = process.env.BADGE_ADMIN_EMAIL
    const password = process.env.BADGE_ADMIN_PASSWORD
    if (!email || !password) throw new Error('set BADGE_ADMIN_EMAIL and BADGE_ADMIN_PASSWORD (or BADGE_ADMIN_TOKEN)')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(`sign-in failed: ${error.message}`)
    token = data.session.access_token
  }

  let skip
  if (args.missing) {
    const { data, error } = await supabase.from('badge_art').select('badge_type, tier')
    if (error) throw new Error(`could not read badge_art: ${error.message}`)
    skip = new Set(data.map(r => `${r.badge_type}:${r.tier}`))
  }
  const specs = tierSpecs(catalog, { badge: args.badge, tier: args.tier, skip })
  if (specs.length === 0) {
    console.log(args.missing ? 'Every tier already has generated art.' : 'No matching badge tier in constants/badges.ts.')
    return
  }

  let failed = 0
  for (const spec of specs) {
    const label = `${spec.badge} tier ${spec.tier} (${spec.tierName})`
    const res = await fetch(`${url}/functions/v1/generate-badge-art`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...spec, dryRun: args.dryRun }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      failed++
      console.error(`✗ ${label}: ${res.status} ${body.error ?? ''}`)
      // These won't get better on the next tier.
      if ([401, 403, 503].includes(res.status)) break
      continue
    }
    if (args.dryRun) console.log(`── ${label} [${body.model}]\n${body.prompt}\n`)
    else console.log(`✓ ${label}: ${body.url}`)
  }
  if (failed) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message ?? err)
    process.exit(1)
  })
}
