/**
 * A small in-memory PostgREST: enough of its query language for the app's
 * reads and writes to behave against fixture rows.
 *
 * - `select`: columns, aliases (`a:b`), casts, JSON paths, `*`, and embeds
 *   (`alias:table!hint!inner(...)`, `table(count)`), resolved through the
 *   foreign keys in the checkout's `types/database.ts` (lib/schema.mjs).
 * - Filters: eq, neq, gt, gte, lt, lte, like, ilike, is, in, cs, cd, ov, `not.`,
 *   `or=(...)` / `and=(...)`, and embedded filters (`club_members.user_id=eq.x`).
 * - `order`, `limit`, `offset` (also per embed), `count=exact`, HEAD,
 *   single-object responses (406 PGRST116 when there is no row).
 * - Writes (POST / PATCH / DELETE, upsert) change the in-memory tables, so a
 *   screen that writes and re-reads sees its own change.
 *
 * Unknown tables answer `[]`: a feature newer than the fixtures degrades to its
 * empty state instead of an error screen.
 */

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

// ─── Select parsing ──────────────────────────────────────────────────────────

/** Split on commas that are not inside parentheses or quotes. */
function splitTop(s, sep = ',') {
  const out = []
  let depth = 0, quote = false, cur = ''
  for (const ch of s) {
    if (ch === '"') quote = !quote
    if (!quote && ch === '(') depth++
    if (!quote && ch === ')') depth--
    if (!quote && depth === 0 && ch === sep) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map(x => x.trim()).filter(Boolean)
}

/** @returns {Array<{kind:'col', key:string, col:string, json?:string[]} | {kind:'star'} | {kind:'embed', key:string, name:string, hint:string|null, inner:boolean, children:any[]}>} */
export function parseSelect(select) {
  const src = (select ?? '*').replace(/\s+/g, ' ').trim() || '*'
  return splitTop(src).map(item => {
    const paren = item.indexOf('(')
    if (paren !== -1 && item.endsWith(')')) {
      const head = item.slice(0, paren).trim()
      const children = parseSelect(item.slice(paren + 1, -1))
      let alias = null, rest = head
      const colon = head.indexOf(':')
      if (colon !== -1 && head[colon + 1] !== ':') { alias = head.slice(0, colon).trim(); rest = head.slice(colon + 1).trim() }
      const [name, ...mods] = rest.split('!').map(x => x.trim())
      const inner = mods.includes('inner')
      const hint = mods.find(m => m !== 'inner' && m !== 'left') ?? null
      return { kind: 'embed', key: alias ?? name, name, hint, inner, children }
    }
    if (item === '*') return { kind: 'star' }
    let alias = null, rest = item
    const colon = item.search(/:(?!:)/)
    if (colon !== -1 && item[colon - 1] !== ':') { alias = item.slice(0, colon).trim(); rest = item.slice(colon + 1).trim() }
    rest = rest.replace(/::[a-z_ ]+$/i, '')
    const parts = rest.split(/->>?/)
    const col = parts[0].trim()
    const json = parts.slice(1).map(p => p.trim().replace(/^'|'$/g, ''))
    return { kind: 'col', key: alias ?? (json.length ? json[json.length - 1] : col), col, json }
  })
}

// ─── Values and filters ──────────────────────────────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

function asTime(v) {
  if (typeof v !== 'string' || !ISO_RE.test(v)) return null
  let s = v.replace(' ', 'T')
  if (!s.includes('T')) s += 'T00:00:00'
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z' // `timestamp without time zone`: UTC wall time
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

function unquote(v) {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
}

/** -1 / 0 / 1 comparing a row value with a filter string, or null when either is null. */
function compare(a, b) {
  if (a === null || a === undefined) return null
  if (typeof a === 'number') { const n = Number(b); return a < n ? -1 : a > n ? 1 : 0 }
  if (typeof a === 'boolean') { const x = b === 'true'; return a === x ? 0 : a ? 1 : -1 }
  const ta = asTime(a), tb = asTime(b)
  if (ta !== null && tb !== null) return ta < tb ? -1 : ta > tb ? 1 : 0
  const sa = String(a)
  return sa < b ? -1 : sa > b ? 1 : 0
}

function parseList(v) {
  const inner = v.replace(/^[({[]|[)}\]]$/g, '')
  return splitTop(inner).map(unquote)
}

function likeToRegex(p, flags) {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${esc}$`, flags)
}

/** Does `value` satisfy `opExpr` (e.g. `eq.5`, `not.is.null`, `in.(a,b)`)? */
export function test(value, opExpr) {
  let negate = false
  let expr = opExpr
  if (expr.startsWith('not.')) { negate = true; expr = expr.slice(4) }
  const dot = expr.indexOf('.')
  const op = dot === -1 ? expr : expr.slice(0, dot)
  const raw = dot === -1 ? '' : expr.slice(dot + 1)
  const arg = unquote(raw)
  let ok
  switch (op) {
    case 'eq': ok = compare(value, arg) === 0; break
    case 'neq': { const c = compare(value, arg); ok = c !== null && c !== 0; break }
    case 'gt': ok = compare(value, arg) === 1; break
    case 'gte': { const c = compare(value, arg); ok = c === 1 || c === 0; break }
    case 'lt': ok = compare(value, arg) === -1; break
    case 'lte': { const c = compare(value, arg); ok = c === -1 || c === 0; break }
    case 'like': ok = value != null && likeToRegex(arg, '').test(String(value)); break
    case 'ilike': ok = value != null && likeToRegex(arg, 'i').test(String(value)); break
    case 'is':
      ok = arg === 'null' ? value === null || value === undefined
        : arg === 'true' ? value === true
        : arg === 'false' ? value === false
        : value === null || value === undefined
      break
    case 'in': { const list = parseList(raw); ok = list.some(x => compare(value, x) === 0); break }
    case 'cs': { const list = parseList(raw); ok = Array.isArray(value) && list.every(x => value.map(String).includes(x)); break }
    case 'cd': { const list = parseList(raw); ok = Array.isArray(value) && value.every(x => list.includes(String(x))); break }
    case 'ov': { const list = parseList(raw); ok = Array.isArray(value) && value.some(x => list.includes(String(x))); break }
    default: ok = true // fts, match, ...: don't filter rather than hide rows
  }
  return negate ? !ok : ok
}

/** `or=(a.eq.1,and(b.is.null,c.gt.2))` → predicate on a row. */
function logicPredicate(kind, body) {
  const parts = splitTop(body.replace(/^\(|\)$/g, '')).map(part => {
    const m = /^(not\.)?(and|or)\((.*)\)$/.exec(part)
    if (m) {
      const p = logicPredicate(m[2], `(${m[3]})`)
      return m[1] ? row => !p(row) : p
    }
    const dot = part.indexOf('.')
    const col = part.slice(0, dot)
    const expr = part.slice(dot + 1)
    return row => test(readPath(row, col), expr)
  })
  return kind === 'or' ? row => parts.some(p => p(row)) : row => parts.every(p => p(row))
}

function readPath(row, col) {
  const parts = col.split(/->>?/)
  let v = row?.[parts[0]]
  for (const p of parts.slice(1)) v = v == null ? undefined : v[p.replace(/^'|'$/g, '')]
  return v
}

function sortRows(rows, order) {
  if (!order) return rows
  const keys = splitTop(order).map(o => {
    const [col, ...mods] = o.split('.')
    const desc = mods.includes('desc')
    const nullsFirst = mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : desc
    return { col, desc, nullsFirst }
  })
  return rows.slice().sort((a, b) => {
    for (const k of keys) {
      const va = readPath(a, k.col), vb = readPath(b, k.col)
      const na = va === null || va === undefined, nb = vb === null || vb === undefined
      if (na && nb) continue
      if (na) return k.nullsFirst ? -1 : 1
      if (nb) return k.nullsFirst ? 1 : -1
      const c = typeof va === 'number' && typeof vb === 'number' ? Math.sign(va - vb) : compare(va, String(vb))
      if (c) return k.desc ? -c : c
    }
    return 0
  })
}

/**
 * Group request params by embed path: `''` holds the top-level filters,
 * `'club_members'` the ones written `club_members.user_id=eq.x`, and so on.
 */
function groupParams(params) {
  const groups = new Map()
  const get = path => {
    if (!groups.has(path)) groups.set(path, { filters: [], logic: [], order: null, limit: null, offset: null })
    return groups.get(path)
  }
  for (const [key, value] of params) {
    if (key === 'select' || key === 'on_conflict' || key === 'columns') continue
    const segs = key.split('.')
    const last = segs[segs.length - 1]
    const path = segs.slice(0, -1).join('.')
    if (last === 'order') get(path).order = value
    else if (last === 'limit') get(path).limit = Number(value)
    else if (last === 'offset') get(path).offset = Number(value)
    else if (last === 'or' || last === 'and') get(path).logic.push(logicPredicate(last, value))
    else if (segs.length > 1 && !RESERVED.has(segs[0])) {
      // `a.b.col`: the filter belongs to embed path `a.b`, unless `a.b` is a JSON path.
      get(path).filters.push({ col: last, expr: value })
    } else get('').filters.push({ col: key, expr: value })
  }
  return groups
}

// ─── The database ────────────────────────────────────────────────────────────

function singular(name) {
  if (/(ch|sh|x|s)es$/.test(name)) return name.slice(0, -2)
  if (name.endsWith('ies')) return name.slice(0, -3) + 'y'
  if (name.endsWith('s')) return name.slice(0, -1)
  return name
}

export function createDb({ tables, views = {}, relationships = [], newId = defaultIds() }) {
  const store = new Map(Object.entries(tables).map(([k, v]) => [k, v.map(r => ({ ...r }))]))

  function rowsOf(name) {
    if (views[name]) return views[name](rowsOf)
    return store.get(name) ?? []
  }

  function relationFor(parent, embed) {
    const { name, hint } = embed
    const matchHint = r => !hint || r.fk === hint || r.columns[0] === hint
    // `profiles:created_by(...)`: embed through a FK column of the parent.
    const viaColumn = relationships.find(r => r.table === parent && r.columns[0] === name)
    if (viaColumn) return { kind: 'm2o', target: viaColumn.refTable, local: viaColumn.columns[0], remote: viaColumn.refColumns[0] }
    const m2o = relationships.find(r => r.table === parent && r.refTable === name && matchHint(r))
    if (m2o) return { kind: 'm2o', target: name, local: m2o.columns[0], remote: m2o.refColumns[0] }
    const o2m = relationships.find(r => r.table === name && r.refTable === parent && matchHint(r))
    if (o2m) return { kind: o2m.oneToOne ? 'o2o' : 'o2m', target: name, local: o2m.refColumns[0], remote: o2m.columns[0] }
    // Many-to-many through a junction table (tournament_pools ↔ tournament_teams).
    for (const a of relationships.filter(r => r.refTable === parent)) {
      const b = relationships.find(r => r.table === a.table && r.refTable === name)
      if (b) return { kind: 'm2m', target: name, junction: a.table, jParent: a.columns[0], jTarget: b.columns[0], local: a.refColumns[0], remote: b.refColumns[0] }
    }
    // No FK metadata (older checkout, fixture-only table): guess by naming.
    if (hint && store.has(parent) && rowsOf(parent).some(r => hint in r)) return { kind: 'm2o', target: name, local: hint, remote: 'id' }
    const fkCol = `${singular(name)}_id`
    if (rowsOf(parent).some(r => fkCol in r)) return { kind: 'm2o', target: name, local: fkCol, remote: 'id' }
    return { kind: 'o2m', target: name, local: 'id', remote: `${singular(parent)}_id` }
  }

  /** Rows of `table` passing a group's filters (not yet projected). */
  function applyFilters(rows, group) {
    if (!group) return rows
    return rows.filter(r => group.filters.every(f => test(readPath(r, f.col), f.expr)) && group.logic.every(p => p(r)))
  }

  function page(rows, group) {
    if (!group) return rows
    let out = sortRows(rows, group.order)
    const offset = group.offset ?? 0
    if (offset) out = out.slice(offset)
    if (group.limit != null && !Number.isNaN(group.limit)) out = out.slice(0, group.limit)
    return out
  }

  /** Project rows of `table` through a parsed select. Returns null for a row an `!inner` embed removes. */
  function project(table, row, items, groups, path) {
    const out = {}
    for (const it of items) {
      if (it.kind === 'star') Object.assign(out, row)
      else if (it.kind === 'col') out[it.key] = it.json.length ? readPath(row, [it.col, ...it.json].join('->')) ?? null : row[it.col] ?? null
    }
    for (const it of items) {
      if (it.kind !== 'embed') continue
      const rel = relationFor(table, it)
      const childPath = path ? `${path}.${it.key}` : it.key
      const group = groups.get(childPath) ?? (it.key !== it.name ? groups.get(path ? `${path}.${it.name}` : it.name) : undefined)
      let children
      if (rel.kind === 'm2m') {
        const ids = new Set(rowsOf(rel.junction).filter(j => j[rel.jParent] === row[rel.local]).map(j => j[rel.jTarget]))
        children = rowsOf(rel.target).filter(r => ids.has(r[rel.remote]))
      } else {
        const key = row[rel.local]
        children = key === null || key === undefined ? [] : rowsOf(rel.target).filter(r => r[rel.remote] === key)
      }
      children = applyFilters(children, group)
      const isCount = it.children.length === 1 && it.children[0].kind === 'col' && it.children[0].col === 'count'
      if (isCount) {
        if (it.inner && children.length === 0) return null
        out[it.key] = [{ count: children.length }]
        continue
      }
      const projected = page(children, group)
        .map(c => project(rel.target, c, it.children, groups, childPath))
        .filter(Boolean)
      if (rel.kind === 'm2o' || rel.kind === 'o2o') {
        if (it.inner && projected.length === 0) return null
        out[it.key] = projected[0] ?? null
      } else {
        if (it.inner && projected.length === 0) return null
        out[it.key] = projected
      }
    }
    return out
  }

  /** Run a read: returns `{ rows, total }` already projected and paged. */
  function query(table, params) {
    const sp = params instanceof URLSearchParams ? params : new URLSearchParams(params)
    const groups = groupParams(sp)
    const items = parseSelect(sp.get('select'))
    const top = groups.get('') ?? { filters: [], logic: [], order: null, limit: null, offset: null }
    const filtered = applyFilters(rowsOf(table), top)
    const projected = sortRows(filtered, top.order)
      .map(r => ({ r, p: project(table, r, items, groups, '') }))
      .filter(x => x.p)
    const total = projected.length
    const offset = top.offset ?? 0
    let paged = projected.slice(offset)
    if (top.limit != null && !Number.isNaN(top.limit)) paged = paged.slice(0, top.limit)
    return { rows: paged.map(x => x.p), total, offset }
  }

  function tableRows(name) {
    if (!store.has(name)) store.set(name, [])
    return store.get(name)
  }

  function withDefaults(table, row) {
    const now = new Date().toISOString()
    const r = { ...row }
    const sample = tableRows(table)[0]
    if (!('id' in r) && (!sample || 'id' in sample)) r.id = newId()
    for (const c of ['created_at', 'joined_at', 'added_at', 'updated_at', 'awarded_at']) {
      if (sample && c in sample && !(c in r)) r[c] = now
    }
    if (table === 'app_events' && !('created_at' in r)) r.created_at = now
    return r
  }

  function keyOf(row, cols) { return cols.map(c => String(row[c])).join('|') }

  function write(method, table, params, body, prefer = '') {
    const sp = params instanceof URLSearchParams ? params : new URLSearchParams(params)
    const rows = tableRows(table)
    let changed = []
    if (method === 'POST') {
      const input = Array.isArray(body) ? body : body ? [body] : []
      const upsert = /resolution=(merge|ignore)-duplicates/.test(prefer)
      const conflict = (sp.get('on_conflict') ?? 'id').split(',').map(s => s.trim())
      for (const raw of input) {
        const r = withDefaults(table, raw)
        const existing = upsert ? rows.findIndex(x => keyOf(x, conflict) === keyOf(r, conflict)) : -1
        if (existing !== -1) {
          if (/merge-duplicates/.test(prefer)) rows[existing] = { ...rows[existing], ...raw }
          changed.push(rows[existing])
        } else { rows.push(r); changed.push(r) }
      }
    } else {
      const top = groupParams(sp).get('') ?? { filters: [], logic: [] }
      const hit = applyFilters(rows, top)
      if (method === 'PATCH') {
        for (const r of hit) Object.assign(r, body ?? {})
        changed = hit
      } else if (method === 'DELETE') {
        const set = new Set(hit)
        store.set(table, rows.filter(r => !set.has(r)))
        changed = hit
      }
    }
    if (!/return=representation/.test(prefer)) return { rows: null }
    const items = parseSelect(sp.get('select'))
    const groups = groupParams(new URLSearchParams())
    return { rows: changed.map(r => project(table, r, items, groups, '')).filter(Boolean) }
  }

  return { query, write, rowsOf, tableRows }
}

function defaultIds() {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}
