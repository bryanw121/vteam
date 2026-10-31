#!/usr/bin/env node
/**
 * Which screens do these changed files affect?
 *
 *   node scripts/shots/affected.mjs <file> [<file> ...]      (or file names on stdin)
 *
 * Prints screen names, one per line. Files a screen lists in `sources` select
 * that screen; shared files (components/ui, theme, layouts, lib, ...) and
 * frontend files no screen claims select DEFAULT_SCREENS; tests, docs, scripts,
 * migrations and the like select nothing.
 */
import { fileURLToPath } from 'node:url'
import { SCREENS, DEFAULT_SCREENS, SHARED_SOURCES, IGNORED_SOURCES } from './screens.mjs'

/** Glob → RegExp. Only `**`, `*`, `?` and `{a,b}` are special; `[`, `(` and the rest are literal (route files are full of them). */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      i++
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?' } else re += '.*'
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      re += '(?:' + glob.slice(i + 1, end).split(',').map(s => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|') + ')'
      i = end
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

const matcher = globs => {
  const res = globs.map(globToRegExp)
  return file => res.some(r => r.test(file))
}

const FRONTEND = /^(app|components|hooks|lib|contexts|constants|utils|types|assets|public)\//

export function affectedScreens(files) {
  const shared = matcher(SHARED_SOURCES)
  const ignored = matcher(IGNORED_SOURCES)
  const perScreen = Object.entries(SCREENS).map(([name, s]) => [name, matcher(s.sources ?? [])])
  const out = new Set()
  let useDefaults = false
  for (const raw of files) {
    const file = raw.replace(/^\.\//, '').trim()
    if (!file || ignored(file)) continue
    const hits = perScreen.filter(([, m]) => m(file)).map(([n]) => n)
    hits.forEach(n => out.add(n))
    if (shared(file) || (hits.length === 0 && FRONTEND.test(file))) useDefaults = true
  }
  if (useDefaults) DEFAULT_SCREENS.forEach(n => out.add(n))
  // Registry order, so output is stable.
  return Object.keys(SCREENS).filter(n => out.has(n))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let files = process.argv.slice(2)
  if (files.length === 0 && !process.stdin.isTTY) {
    const chunks = []
    for await (const c of process.stdin) chunks.push(c)
    files = Buffer.concat(chunks).toString('utf8').split(/\s+/).filter(Boolean)
  }
  for (const name of affectedScreens(files)) console.log(name)
}
