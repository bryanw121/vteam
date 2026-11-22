#!/usr/bin/env node
/**
 * After `expo export` (#347): find the event screen's lazy chunk
 * (`EventDetailScreen-<hash>.js`, from components/event/EventDetailRoute.web.tsx)
 * and write `<dist>/event-chunk.json`:
 *
 *   { "src": "/_expo/static/js/web/EventDetailScreen-<hash>.js",
 *     "tag": "<link rel=\"preload\" as=\"script\" href=\"…\">" }
 *
 * `api/event-page.ts` puts `tag` into the <head> of every `/event/<id>` page, so a
 * shared event link downloads the chunk next to the app scripts instead of after
 * the app has started (measured: Join on a mid-range phone 4.09 s → 3.53 s).
 * `scripts/shots/event-link-flow.mjs` injects the same tag, so CI times what
 * production serves. Fails when there is no such chunk, or more than one: a
 * renamed chunk would otherwise silently drop the preload.
 *
 *   node scripts/event-chunk.mjs --dist dist
 */
import { readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CHUNK_DIR = '_expo/static/js/web'
export const CHUNK_RE = /^EventDetailScreen-[A-Za-z0-9_-]+\.js$/

/** The one event chunk among `files` (names in CHUNK_DIR), as its served path. Throws on none or several. */
export function eventChunkSrc(files) {
  const found = files.filter(f => CHUNK_RE.test(f))
  if (found.length !== 1) {
    throw new Error(`expected one EventDetailScreen-*.js in ${CHUNK_DIR}, found ${found.length}${found.length ? `: ${found.join(', ')}` : ''}`)
  }
  return `/${CHUNK_DIR}/${found[0]}`
}

/** The <link> for the page's <head>. `src` comes from eventChunkSrc (no characters to escape). */
export function preloadTag(src) {
  return `<link rel="preload" as="script" href="${src}">`
}

export async function writeEventChunk(dist) {
  const files = await readdir(join(dist, CHUNK_DIR))
  const src = eventChunkSrc(files)
  const out = { src, tag: preloadTag(src) }
  await writeFile(join(dist, 'event-chunk.json'), JSON.stringify(out) + '\n')
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--dist')
  const dist = resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'dist')
  try {
    const { src } = await writeEventChunk(dist)
    console.log(`event-chunk.json: ${src}`)
  } catch (err) {
    console.error(`event-chunk: ${err.message}`)
    process.exit(1)
  }
}
