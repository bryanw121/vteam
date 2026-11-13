/**
 * Pure helpers for the startup guard (#225, scripts/shots/startup-budget.mjs):
 * describing a read, finding duplicates, comparing with the budget, and the
 * job summary. Tested in scripts/shots/shots.test.mjs.
 */

/** `GET rest/v1/profiles?select=avatar_url&id=eq.x` → `GET profiles select=avatar_url` (enough to tell reads apart). */
export function describeRequest(method, href) {
  const url = new URL(href)
  const path = url.pathname.replace(/^\/(rest|auth|storage|functions)\/v1\//, '')
  const select = url.searchParams.get('select')
  return `${method} ${path}${select ? ` select=${select.slice(0, 60)}` : ''}`
}

/** Reads that appear more than once (each listed once). */
export function duplicates(list) {
  const seen = new Map()
  for (const r of list) seen.set(r, (seen.get(r) ?? 0) + 1)
  return [...seen].filter(([, n]) => n > 1).map(([r]) => r).sort()
}

/** Reads in `now` beyond those in `before` (multiset difference). */
export function newReads(before = [], now = []) {
  const left = new Map()
  for (const r of before) left.set(r, (left.get(r) ?? 0) + 1)
  const extra = []
  for (const r of now) {
    const n = left.get(r) ?? 0
    if (n > 0) left.set(r, n - 1)
    else extra.push(r)
  }
  return extra
}

/**
 * Compare measured screens with the budget. Returns `{ failures, notes }`:
 * a screen with no budget yet only gets a note (it enters the budget with `--update`).
 */
export function compareStartup(budget, measured) {
  const failures = []
  const notes = []
  for (const [name, m] of Object.entries(measured)) {
    const b = budget[name]
    if (!b) { notes.push(`${name}: no budget yet (run npm run startup:baseline)`); continue }
    if (m.requests > b.requests) {
      const extra = newReads(b.requestList, m.requestList)
      failures.push(`${name}: ${m.requests} reads, budget ${b.requests}${extra.length ? `. New: ${extra.join('; ')}` : ''}`)
    } else if (m.requests < b.requests) {
      notes.push(`${name}: ${m.requests} reads, budget ${b.requests}: lower it with npm run startup:baseline`)
    }
    const newDupes = m.duplicates.filter(d => !(b.allowedDuplicates ?? []).includes(d))
    if (newDupes.length) failures.push(`${name}: sent twice: ${newDupes.join('; ')}`)
    if (b.paintMs != null) {
      if (m.paintMs == null) failures.push(`${name}: never painted while the server was slow (budget ${b.paintMs} ms)`)
      else if (m.paintMs > b.paintMs) failures.push(`${name}: painted at ${m.paintMs} ms, budget ${b.paintMs} ms`)
    }
  }
  return { failures, notes }
}

export function formatStartupSummary(measured, result, delay) {
  const rows = Object.entries(measured).map(([name, m]) =>
    `| ${name} | ${m.paintMs == null ? 'never' : `${m.paintMs} ms`} | ${m.requests} | ${m.duplicates.length ? m.duplicates.join('<br>') : '–'} |`)
  return [
    `## Startup budget ${result.failures.length ? '❌' : '✅'}`,
    '',
    `Mocked export. Paint: returning viewer, expired token, every Supabase response held ${delay} ms. Reads: first visit, 6 s.`,
    '',
    '| Screen | Paint | Reads | Sent twice |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    ...result.failures.map(f => `- ❌ ${f}`),
    ...result.notes.map(n => `- ${n}`),
  ].join('\n')
}
