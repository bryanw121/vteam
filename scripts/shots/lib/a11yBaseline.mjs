/**
 * Pure logic for the accessibility check (a11y.mjs): compare an axe scan with
 * the committed baseline, and render the result as Markdown (CI job summary)
 * and HTML (the uploaded report). No I/O here, so it is unit-tested directly.
 *
 * Scan result, one per (screen, size):
 *   { screen, size: 'mobile' | 'desktop', errors: string[],
 *     violations: [{ id, impact, help, helpUrl, nodes: number, target: string | null }] }
 *
 * Baseline (scripts/shots/a11y-baseline.json), serious and critical rules only:
 *   { "<screen>": { "mobile": { "<rule>": <node count> }, "desktop": { ... } } }
 * Node counts, not selectors: react-native-web class names change from build to build.
 */

/** Impacts that fail the check. Minor and moderate findings are reported only. */
export const GATED_IMPACTS = ['serious', 'critical']

export const isGated = v => GATED_IMPACTS.includes(v.impact)

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 }
const byImpact = (a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9) || a.id.localeCompare(b.id)

/** The baseline that `results` would produce (what `npm run a11y:baseline` writes). */
export function baselineFrom(results, previous = {}) {
  const next = structuredClone(previous)
  // A rescanned (screen, size) replaces its entry; screens not scanned this time keep theirs.
  for (const r of results) {
    if (r.errors.length) continue // never bake a failed scan into the baseline
    const rules = {}
    for (const v of [...r.violations].sort(byImpact)) if (isGated(v)) rules[v.id] = v.nodes
    ;(next[r.screen] ??= {})[r.size] = rules
  }
  return sortKeys(next)
}

function sortKeys(baseline) {
  const out = {}
  for (const screen of Object.keys(baseline).sort()) {
    out[screen] = {}
    for (const size of ['mobile', 'desktop', ...Object.keys(baseline[screen]).filter(s => s !== 'mobile' && s !== 'desktop').sort()]) {
      if (!baseline[screen][size]) continue
      out[screen][size] = Object.fromEntries(Object.entries(baseline[screen][size]).sort(([a], [b]) => a.localeCompare(b)))
    }
  }
  return out
}

/**
 * Compare a scan with the baseline.
 * @param {object[]} results scan results
 * @param {object} baseline
 * @param {{ allScreens?: string[] }} [opts] every screen the harness knows; baseline
 *   screens not in it are reported as stale (a removed screen). Omit on a partial run.
 * @returns {{ ok: boolean, failures: object[], improvements: object[], stale: string[], reported: object[] }}
 *   failures: { kind: 'new-rule' | 'increase' | 'scan-error', screen, size, rule?, impact?, baseline?, count?, help?, helpUrl?, target?, message? }
 *   improvements: { screen, size, rule, baseline, count }  (count 0 = fixed)
 *   reported: minor/moderate violations (never fail)
 */
export function diffBaseline(results, baseline, opts = {}) {
  const failures = []
  const improvements = []
  const reported = []
  for (const r of results) {
    if (r.errors.length) {
      failures.push({ kind: 'scan-error', screen: r.screen, size: r.size, message: r.errors.join(' | ') })
      continue
    }
    const known = baseline[r.screen]?.[r.size] ?? null
    const seen = new Set()
    for (const v of r.violations) {
      if (!isGated(v)) { reported.push({ screen: r.screen, size: r.size, ...v }); continue }
      seen.add(v.id)
      const base = known?.[v.id]
      const info = { screen: r.screen, size: r.size, rule: v.id, impact: v.impact, count: v.nodes, help: v.help, helpUrl: v.helpUrl, target: v.target }
      if (base === undefined) failures.push({ kind: 'new-rule', newScreen: !known, baseline: 0, ...info })
      else if (v.nodes > base) failures.push({ kind: 'increase', baseline: base, ...info })
      else if (v.nodes < base) improvements.push({ screen: r.screen, size: r.size, rule: v.id, baseline: base, count: v.nodes })
    }
    for (const [rule, base] of Object.entries(known ?? {})) {
      if (!seen.has(rule) && base > 0) improvements.push({ screen: r.screen, size: r.size, rule, baseline: base, count: 0 })
    }
  }
  const stale = opts.allScreens ? Object.keys(baseline).filter(s => !opts.allScreens.includes(s)).sort() : []
  return { ok: failures.length === 0, failures, improvements, stale, reported }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const mdCell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const where = (screen, size) => `${screen}${size === 'desktop' ? ' (desktop)' : ''}`

/** Rule → { impact, help, helpUrl, screens: Set, nodes } over every violation in the scan. */
export function summarizeRules(results) {
  const rules = new Map()
  for (const r of results) {
    for (const v of r.violations) {
      const e = rules.get(v.id) ?? { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, screens: new Set(), nodes: 0 }
      if ((IMPACT_ORDER[v.impact] ?? 9) < (IMPACT_ORDER[e.impact] ?? 9)) e.impact = v.impact
      e.screens.add(r.screen)
      e.nodes += v.nodes
      rules.set(v.id, e)
    }
  }
  return [...rules.values()].sort((a, b) => byImpact(a, b))
}

/** Markdown for $GITHUB_STEP_SUMMARY (also printed by a11y.mjs). */
export function renderMarkdown(results, diff, meta = {}) {
  const lines = []
  const scanned = new Set(results.map(r => r.screen)).size
  lines.push(`## Accessibility (axe ${meta.axeVersion ?? ''})`.trimEnd())
  lines.push('')
  lines.push(`${diff.ok ? '✅ No new serious or critical violations' : `❌ ${diff.failures.length} new serious/critical finding${diff.failures.length === 1 ? '' : 's'}`} · ${scanned} screens × ${new Set(results.map(r => r.size)).size} viewports${meta.seconds ? ` · ${meta.seconds}s` : ''}`)
  lines.push('')
  if (diff.failures.length) {
    lines.push('### New violations (fail)')
    lines.push('')
    lines.push('| Rule | Impact | Screen | Baseline → now | Sample target | Help |')
    lines.push('|---|---|---|---|---|---|')
    for (const f of diff.failures) {
      if (f.kind === 'scan-error') lines.push(`| scan error | | ${mdCell(where(f.screen, f.size))} | | ${mdCell(f.message.slice(0, 200))} | |`)
      else lines.push(`| \`${f.rule}\` | ${f.impact} | ${mdCell(where(f.screen, f.size))}${f.newScreen ? ' (not in baseline)' : ''} | ${f.baseline} → ${f.count} | ${f.target ? `\`${mdCell(f.target).slice(0, 120)}\`` : ''} | [${mdCell(f.help)}](${f.helpUrl}) |`)
    }
    lines.push('')
    lines.push('Fix these (an `accessibilityLabel`, a role, a contrast token...). Only if a finding is accepted on purpose, run `npm run a11y:baseline` and commit `scripts/shots/a11y-baseline.json`.')
    lines.push('')
  }
  if (diff.improvements.length) {
    lines.push(`### Fewer violations than the baseline (${diff.improvements.length})`)
    lines.push('')
    lines.push('Run `npm run a11y:baseline` to lock in the fix, so it can\'t come back.')
    lines.push('')
    lines.push('| Rule | Screen | Baseline → now |')
    lines.push('|---|---|---|')
    for (const i of diff.improvements) lines.push(`| \`${i.rule}\` | ${mdCell(where(i.screen, i.size))} | ${i.baseline} → ${i.count} |`)
    lines.push('')
  }
  if (diff.stale.length) {
    lines.push(`Baseline entries for screens that no longer exist: ${diff.stale.map(s => `\`${s}\``).join(', ')}. Run \`npm run a11y:baseline\` to drop them.`)
    lines.push('')
  }
  const rules = summarizeRules(results)
  if (rules.length) {
    lines.push('### All findings')
    lines.push('')
    lines.push('| Rule | Impact | Screens | Nodes | Gated |')
    lines.push('|---|---|---|---|---|')
    for (const r of rules) lines.push(`| [\`${r.id}\`](${r.helpUrl}) | ${r.impact} | ${r.screens.size} | ${r.nodes} | ${GATED_IMPACTS.includes(r.impact) ? 'yes' : 'no (reported only)'} |`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Standalone HTML report: every violation with rule, impact, screen, viewport, sample target and help link. */
export function renderHtml(results, diff, meta = {}) {
  const failed = new Set(diff.failures.filter(f => f.rule).map(f => `${f.screen}|${f.size}|${f.rule}`))
  const rows = results.flatMap(r => [...r.violations].sort(byImpact).map(v => {
    const isNew = failed.has(`${r.screen}|${r.size}|${v.id}`)
    return `<tr class="${esc(v.impact)}${isNew ? ' new' : ''}"><td><code>${esc(v.id)}</code>${isNew ? ' <b>new</b>' : ''}</td><td>${esc(v.impact)}</td><td>${esc(r.screen)}</td><td>${esc(r.size)}</td><td>${v.nodes}</td><td><code>${esc(v.target)}</code></td><td><a href="${esc(v.helpUrl)}">${esc(v.help)}</a></td></tr>`
  }))
  const errors = results.filter(r => r.errors.length).map(r => `<li>${esc(where(r.screen, r.size))}: ${esc(r.errors.join(' | '))}</li>`)
  const status = diff.ok ? 'No new serious or critical violations' : `${diff.failures.length} new serious/critical finding(s)`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>vteam accessibility report</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1b1a22;background:#fff}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3f2f7;position:sticky;top:0}code{font-size:12px;word-break:break-all}
tr.critical td:nth-child(2){color:#a1001b;font-weight:600}tr.serious td:nth-child(2){color:#9a4a00;font-weight:600}
tr.new{background:#fff1f1}.ok{color:#0b6b2e}.fail{color:#a1001b}
</style></head><body>
<h1>Accessibility report</h1>
<p class="${diff.ok ? 'ok' : 'fail'}"><b>${esc(status)}</b>. ${new Set(results.map(r => r.screen)).size} screens, axe ${esc(meta.axeVersion ?? '')}, tags ${esc((meta.tags ?? []).join(', '))}${meta.seconds ? `, ${meta.seconds}s` : ''}. Serious and critical rules are compared with <code>scripts/shots/a11y-baseline.json</code>; minor and moderate ones are listed only.</p>
${errors.length ? `<h2>Scan errors</h2><ul>${errors.join('')}</ul>` : ''}
${diff.improvements.length ? `<p>${diff.improvements.length} count(s) below the baseline: run <code>npm run a11y:baseline</code> to lock them in.</p>` : ''}
<table><thead><tr><th>Rule</th><th>Impact</th><th>Screen</th><th>Viewport</th><th>Nodes</th><th>Sample target</th><th>Help</th></tr></thead>
<tbody>${rows.join('\n') || '<tr><td colspan="7">No violations.</td></tr>'}</tbody></table>
</body></html>
`
}
