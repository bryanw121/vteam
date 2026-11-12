/**
 * Reads foreign keys out of a checkout's generated `types/database.ts`, so the
 * fake PostgREST can resolve embeds (`profiles!events_created_by_fkey (...)`,
 * `club_members(count)`) the way the real one does, for whichever ref is being
 * captured. Tables added after this tool was written resolve too.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** @returns {{ table: string, fk: string, columns: string[], refTable: string, refColumns: string[], oneToOne: boolean }[]} */
export function loadRelationships(srcDir) {
  const file = join(srcDir, 'types', 'database.ts')
  if (!existsSync(file)) return []
  return parseRelationships(readFileSync(file, 'utf8'))
}

export function parseRelationships(source) {
  const rels = []
  // Each table/view block: `      name: {\n        Row: {` ... `Relationships: [ ... ]`
  const blockRe = /^ {6}([a-z_][a-z0-9_]*): \{\n {8}Row: \{[\s\S]*?^ {8}Relationships: (?:\[\]|\[([\s\S]*?)^ {8}\])/gm
  let m
  while ((m = blockRe.exec(source))) {
    const table = m[1]
    const entryRe = /foreignKeyName: "([^"]+)"\s*columns: \[([^\]]*)\]\s*isOneToOne: (true|false)\s*referencedRelation: "([^"]+)"\s*referencedColumns: \[([^\]]*)\]/g
    let e
    while ((e = entryRe.exec(m[2] ?? ''))) {
      const list = s => s.split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean)
      rels.push({ table, fk: e[1], columns: list(e[2]), oneToOne: e[3] === 'true', refTable: e[4], refColumns: list(e[5]) })
    }
  }
  return rels
}

/**
 * Ids of every one-time banner and guided tour in a checkout, so captures can
 * mark them all as seen: a first-visit banner would otherwise sit on top of the
 * screen in every shot.
 */
export function loadSeenIds(srcDir) {
  const ids = []
  const banners = join(srcDir, 'constants', 'banners.ts')
  if (existsSync(banners)) {
    for (const m of readFileSync(banners, 'utf8').matchAll(/\bid:\s*['"]([^'"]+)['"]/g)) ids.push(m[1])
  }
  const tours = join(srcDir, 'constants', 'tours.ts')
  if (existsSync(tours)) {
    const src = readFileSync(tours, 'utf8')
    const body = src.slice(src.indexOf('TOURS'))
    for (const m of body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9_]*): \{/gm)) ids.push(`tour-${m[1]}-done`)
  }
  return ids
}
