#!/usr/bin/env node
/**
 * Flags destructive statements in migration files added or changed by this PR.
 *
 * A migration is applied to live (and beta) BEFORE the PR's code is deployed,
 * so the app that is running at that moment is the old one. Additive changes
 * (new table, new nullable column, new function) are safe for it; destructive
 * ones (DROP, RENAME, ALTER TYPE, SET NOT NULL, ...) break it immediately.
 * Do those as a separate "contract" step once no deployed code uses the old
 * shape (expand, then contract: see CLAUDE.md "Schema migrations").
 *
 * A migration that really is a contract step opts in with a line
 *   -- contract: <why nothing uses the old shape any more>
 *
 * Usage: node scripts/migration-safety.mjs [base-ref]   (default origin/main)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const RULES = [
  [/\bdrop\s+(table|column|view|materialized\s+view|function|procedure|type|schema|trigger|policy|index|constraint)\b/i, 'drops an object'],
  [/\brename\s+(column\s+)?\w*\s*to\b|\brename\s+to\b/i, 'renames something'],
  [/\balter\s+column\s+[\w"]+\s+(set\s+data\s+)?type\b/i, 'changes a column type'],
  [/\bset\s+not\s+null\b/i, 'makes a column required'],
  [/\btruncate\b/i, 'truncates a table'],
]

/** Pure: problems in one migration's SQL (empty when safe or marked contract). */
export function findDestructive(sql) {
  if (/^\s*--\s*contract:\s*\S/im.test(sql)) return []
  // Ignore comments and the bodies of functions ($$ ... $$), where DROP etc.
  // run later as code (e.g. a temp table), not as a schema change now.
  const code = sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
  const out = []
  for (const [re, what] of RULES) {
    for (const m of code.matchAll(new RegExp(re.source, 'gi'))) {
      if (isReplacedLater(code, m)) continue
      out.push(`${what}: "${m[0].replace(/\s+/g, ' ').trim()}"`)
      break
    }
  }
  // "add column ... not null" with no default fails on existing rows / old inserts.
  for (const m of code.matchAll(/\badd\s+column\s+(if\s+not\s+exists\s+)?[^,;]*?\bnot\s+null\b[^,;]*/gi)) {
    if (!/\bdefault\b/i.test(m[0])) out.push(`adds a required column without a default: "${m[0].replace(/\s+/g, ' ').trim()}"`)
  }
  return out
}

/**
 * `drop policy if exists "p" on t; create policy "p" ...` (and the same for
 * triggers, functions, views, indexes, constraints) replaces an object in one
 * go: not destructive when the same name is created again later in the file.
 */
function isReplacedLater(code, m) {
  if (!/^drop\s/i.test(m[0])) return false
  const after = code.slice(m.index + m[0].length)
  const name = after.match(/^\s*(?:if\s+exists\s+)?("[^"]+"|[\w.]+)/i)?.[1]
  if (!name) return false
  const bare = name.replace(/"/g, '').split('.').pop()
  const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b(create|add)\\b[^;]*?"?\\b${esc}\\b"?`, 'i').test(after)
}

/** Up migrations added or changed in this PR (`*.down.sql` rollbacks are not scanned: dropping is their job). */
function changedMigrations(base) {
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', 'supabase/migrations/'], { encoding: 'utf8' })
  return out.split('\n').filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql') && existsSync(f))
}

/** Every up migration needs a rollback beside it, so beta can be reset if its PR is closed. */
export function downFileFor(file) {
  return file.replace(/\.sql$/, '.down.sql')
}

function main() {
  const base = process.argv[2] || 'origin/main'
  const files = changedMigrations(base)
  let bad = 0
  for (const f of files) {
    const problems = findDestructive(readFileSync(f, 'utf8'))
    if (!existsSync(downFileFor(f))) problems.push(`has no rollback: add ${downFileFor(f).split('/').pop()} that undoes it (used to reset beta if the PR is closed)`)
    if (!problems.length) continue
    bad++
    console.error(`${f}:`)
    for (const p of problems) console.error(`  ${p}`)
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${f},title=Destructive migration::${problems.join('; ')}`)
  }
  if (bad) {
    console.error(`\n${bad} migration(s) need attention. A destructive one would break the app that is deployed`)
    console.error('when it is applied: make it additive (expand), or, if no deployed code uses the old shape any more,')
    console.error('add a line "-- contract: <reason>". Every migration needs a .down.sql. See CLAUDE.md "Schema migrations".')
    process.exitCode = 1
  } else {
    console.log(`Migration safety: ${files.length} changed migration(s), nothing destructive, all have rollbacks.`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
