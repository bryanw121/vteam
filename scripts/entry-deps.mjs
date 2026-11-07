#!/usr/bin/env node
/**
 * Keep heavy libraries out of the web entry chunk (#193).
 *
 * Every web visit downloads and parses the scripts index.html loads: the
 * metro runtime, `__common-*.js` when there are lazy chunks, and `entry-*.js`.
 * Reanimated, Gesture Handler (+ worklets, hammerjs) and react-virtuoso are
 * ~200 KB gzip of it, but only the event screen (team drag), Settings → Badges
 * and a chat thread need them on web, and those load as their own chunks
 * (components/LazyChunk.tsx). This reads those scripts' source maps and fails
 * if any of them is back in the first load. `--report` also lists the biggest packages.
 *
 *   node scripts/entry-deps.mjs --dist dist-mock [--report]
 *
 * The export must be built with `--source-maps` (CI's shots-mock export is).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Packages that must load lazily on web. */
// react-native-worklets is not listed: it uses `require.resolveWeak('./index')`,
// which Expo's serializer treats as its own async chunk, so its ~14 KB gzip
// always lands in __common (defined there, but only run when the event screen
// requires it). Everything else here stays out of the first load.
export const LAZY_ONLY = [
  'react-native-reanimated',
  'react-native-gesture-handler',
  '@egjs/hammerjs',
  'react-virtuoso',
]

/** node_modules package of a source path, or null for app code. */
export function packageOf(source) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source)
  return m ? m[1] : null
}

/** Source-map `sources` + `sourcesContent` → { banned: [{pkg, files}], packages: [{pkg, files, chars}] }. */
export function analyzeEntryMap(map) {
  const byPkg = new Map()
  map.sources.forEach((src, i) => {
    const pkg = packageOf(src) ?? '(app code)'
    const row = byPkg.get(pkg) ?? { pkg, files: 0, chars: 0 }
    row.files += 1
    row.chars += map.sourcesContent?.[i]?.length ?? 0
    byPkg.set(pkg, row)
  })
  const packages = [...byPkg.values()].sort((a, b) => b.chars - a.chars)
  const banned = packages.filter(p => LAZY_ONLY.includes(p.pkg))
  return { banned, packages }
}

/** The scripts index.html loads before the app runs (runtime, any __common chunk, entry). */
export function firstLoadScripts(html) {
  return [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(m => m[1])
}

function main(argv) {
  const i = argv.indexOf('--dist')
  const dist = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : 'dist')
  const scripts = firstLoadScripts(readFileSync(join(dist, 'index.html'), 'utf8'))
  if (!scripts.some(s => /\/entry-[^/]*\.js$/.test(s))) throw new Error(`No entry chunk in ${dist}/index.html`)
  const merged = { sources: [], sourcesContent: [] }
  let raw = 0
  for (const src of scripts) {
    const file = join(dist, src)
    raw += readFileSync(file).length
    let map
    try {
      map = JSON.parse(readFileSync(`${file}.map`, 'utf8'))
    } catch {
      throw new Error(`No source map next to ${src}: export with --source-maps`)
    }
    merged.sources.push(...map.sources)
    merged.sourcesContent.push(...(map.sourcesContent ?? map.sources.map(() => '')))
  }
  const { banned, packages } = analyzeEntryMap(merged)
  console.log(`First load: ${scripts.length} scripts, ${(raw / 1024).toFixed(0)} KB raw, ${merged.sources.length} modules`)
  for (const src of scripts) console.log(`  ${src}`)
  if (argv.includes('--report')) {
    for (const p of packages.slice(0, 25)) console.log(`  ${(p.chars / 1024).toFixed(0).padStart(6)} KB src  ${String(p.files).padStart(4)} files  ${p.pkg}`)
  }
  if (banned.length) {
    console.error(`\nThese load lazily on web and must not be in the first-load scripts:\n${banned.map(b => `  - ${b.pkg} (${b.files} files)`).join('\n')}`)
    console.error('Import them only from a screen or component loaded through components/LazyChunk.tsx, and from only one such chunk:')
    console.error('Metro moves a module two lazy chunks share into __common, which index.html loads up front (see #193).')
    process.exit(1)
  }
  console.log(`OK: none of ${LAZY_ONLY.join(', ')} in the first load.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
