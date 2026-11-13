/**
 * Pure helpers for scripts/shots/stability-flow.mjs (#255): turn what a page
 * recorded into findings, compare findings with the baseline, and write the
 * report. No Playwright here, so stability.test.mjs can check it on recorded
 * samples.
 *
 * A finding: { check, screen, viewport, kind, value, detail, caseId?, frames? }
 * - check: 'tours' | 'scroll' | 'links'
 * - kind: what went wrong, prefixed with how the screen was reached for scroll
 *   findings ('reload:layout-shift', 'back:not-restored', 'back:jump', ...), and
 *   ending in '@slow' when it was found with the server slowed down (--full only)
 * - value: how bad, in the kind's own unit (layout-shift score, px, or 1)
 *
 * The baseline (stability-baseline.json) is check → screen → viewport → kind →
 * the largest value accepted, each with an issue link in `_notes`. It only
 * shrinks, like the axe baseline.
 */

/** Layout shifts at or below this (after the splash) are not findings. CLS "good" is 0.1; 0.01 is a visible nudge. */
export const SHIFT_FLOOR = 0.01
/** Scroll offsets within this many px count as the same place. */
export const OFFSET_TOLERANCE = 8

/**
 * Findings for one refresh or Back, from the page's samples (every ~60 ms:
 * { t, y, inner, splash, painted, text, spinners }) and its layout-shift
 * entries ({ t, v, input, src: [{ n, dy, dh }] }).
 * `nav`: 'reload' | 'back'. `target`: the offset that Back should come back to (null on reload,
 * which lands at the top by design: the scroll memory lives in memory).
 */
export function analyzeSamples({ samples, shifts = [], nav, target = null, floor = SHIFT_FLOOR }) {
  const out = []
  if (!samples?.length) return [{ kind: `${nav}:no-samples`, value: 1, detail: 'the page recorded nothing' }]
  const off = s => Math.max(s.y || 0, s.inner || 0)
  const shown = samples.filter(s => !s.splash)
  const firstPaint = shown.find(s => s.painted)
  const last = samples[samples.length - 1]

  if (target != null && Math.abs(off(last) - target) > 40) {
    out.push({ kind: `${nav}:not-restored`, value: Math.abs(off(last) - target), detail: `came back at ${off(last)} px, left at ${target} px` })
  } else if (firstPaint && Math.abs(off(firstPaint) - off(last)) > OFFSET_TOLERANCE) {
    out.push({ kind: `${nav}:jump`, value: Math.abs(off(firstPaint) - off(last)), detail: `first painted at ${off(firstPaint)} px (+${firstPaint.t} ms), settled at ${off(last)} px` })
  }

  const splashEnd = shown[0]?.t ?? 0
  const late = shifts.filter(s => !s.input && s.t > splashEnd && s.v > floor)
  if (late.length) {
    const worst = late.reduce((a, b) => (b.v > a.v ? b : a))
    const total = late.reduce((a, s) => a + s.v, 0)
    // The worst single shift, not the sum: how many small shifts a run catches varies with timing.
    out.push({
      kind: `${nav}:layout-shift`,
      value: round(worst.v),
      detail: `${late.length} shift(s) totalling ${total.toFixed(3)}, worst ${worst.v.toFixed(3)} at +${Math.round(worst.t)} ms: ${describeSources(worst.src)}`,
    })
  }

  let peak = 0
  for (const s of shown) {
    if (!s.painted) continue
    peak = Math.max(peak, s.text)
    if (peak > 200 && s.text < peak * 0.7) {
      out.push({ kind: `${nav}:content-dropped`, value: round(1 - s.text / peak), detail: `visible text fell from ${peak} to ${s.text} chars at +${s.t} ms` })
      break
    }
  }

  let content = false
  for (const s of shown) {
    if (s.painted && s.text > 300 && s.spinners === 0) content = true
    else if (content && s.spinners > 0) {
      out.push({ kind: `${nav}:spinner-after-content`, value: 1, detail: `a spinner came back at +${s.t} ms` })
      break
    }
  }
  return out
}

function describeSources(src = []) {
  return src.slice(0, 3).map(s => `${s.n} moved ${Math.round(s.dy)} px${s.dh ? `, height ${Math.round(s.dh)} px` : ''}`).join('; ') || 'no source node'
}

function round(v) { return Math.round(v * 1000) / 1000 }

/**
 * Findings for one tour walk: each step read as { n, of, spot } ("n of M" on
 * the card, and whether a spotlight box was on screen). A gap, a repeat, a
 * missing spotlight or a walk that ends early is a finding.
 */
export function tourFindings(steps, expected) {
  const out = []
  const of = expected ?? steps[0]?.of
  if (!steps.length) return [{ kind: 'did-not-start', value: 1, detail: 'no tour card appeared' }]
  const seen = steps.map(s => s.n)
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].n !== i + 1) { out.push({ kind: 'skipped-step', value: 1, detail: `steps shown: ${seen.join(', ')} of ${of}` }); break }
  }
  if (!out.length && steps.length !== of) out.push({ kind: 'ended-early', value: 1, detail: `stopped after ${steps.length} of ${of}` })
  const dark = steps.filter(s => !s.spot)
  if (dark.length) out.push({ kind: 'no-spotlight', value: 1, detail: `no spotlight on step ${dark.map(s => s.n).join(', ')}` })
  return out
}

/** Compare a link's query with what it should be: `null` means the param must be absent. Returns the mismatches as strings. */
export function paramMismatches(params, want) {
  return Object.entries(want)
    .filter(([k, v]) => (v === null ? params[k] !== undefined : params[k] !== v))
    .map(([k, v]) => `${k}: want ${v ?? '(absent)'}, got ${params[k] ?? '(absent)'}`)
}

const keyOf = f => [f.check, f.screen, f.viewport, f.kind]

/** Largest value per check → screen → viewport → kind. */
export function baselineFrom(findings, notes = {}) {
  const b = {}
  for (const f of findings) {
    const [c, s, v, k] = keyOf(f)
    const at = ((b[c] ??= {})[s] ??= {})[v] ??= {}
    at[k] = Math.max(at[k] ?? 0, f.value)
  }
  return Object.keys(notes).length ? { _notes: notes, ...b } : b
}

function baseValue(baseline, f) {
  const [c, s, v, k] = keyOf(f)
  return baseline?.[c]?.[s]?.[v]?.[k]
}

/** True when `value` is clearly worse than `base` (headroom for runner noise). */
export function worseThan(kind, value, base) {
  if (base == null) return true
  if (kind.endsWith('layout-shift')) return value > base * 1.25 + SHIFT_FLOOR
  if (kind.endsWith('not-restored') || kind.endsWith('jump')) return value > base + 40
  return value > base
}

/**
 * Split findings against the baseline: `failures` are new or worse, `known`
 * are within it, and `improved` are baseline entries no longer found or now
 * clearly smaller (shrink the baseline with --update-baseline).
 * `ran`: keys of what this run covered, as 'check|screen|viewport', so an entry for
 * something this run didn't do (PR mode skips some) isn't reported as fixed.
 */
export function diffBaseline(findings, baseline, ran = null) {
  const failures = [], known = [], improved = []
  for (const f of findings) (worseThan(f.kind, f.value, baseValue(baseline, f)) ? failures : known).push(f)
  for (const [c, screens] of Object.entries(baseline ?? {})) {
    if (c.startsWith('_')) continue
    for (const [s, vps] of Object.entries(screens)) for (const [v, kinds] of Object.entries(vps)) {
      if (ran && !ran.has(`${c}|${s}|${v}`)) continue
      for (const [k, base] of Object.entries(kinds)) {
        if (ran && k.endsWith('@slow') && !ran.has('@slow')) continue
        const now = findings.filter(f => f.check === c && f.screen === s && f.viewport === v && f.kind === k)
        const max = now.reduce((a, f) => Math.max(a, f.value), 0)
        if (!now.length) improved.push({ check: c, screen: s, viewport: v, kind: k, base, value: 0 })
        else if (max < base / 2) improved.push({ check: c, screen: s, viewport: v, kind: k, base, value: max })
      }
    }
  }
  return { failures, known, improved }
}

/** Keep only failures a second run reproduces, at the smaller of the two values (runner noise). */
export function confirmFailures(first, second) {
  const out = []
  for (const f of first) {
    const again = second.find(g => g.check === f.check && g.screen === f.screen && g.viewport === f.viewport && g.kind === f.kind && g.caseId === f.caseId)
    if (again) out.push({ ...f, value: Math.min(f.value, again.value), detail: f.value <= again.value ? f.detail : again.detail })
  }
  return out
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const md = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function renderMarkdown({ diff, counts, seconds, mode }) {
  const lines = ['## Stability check', '']
  lines.push(`${mode} run, ${counts.cases} cases in ${seconds} s: tours ${counts.tours}, refresh/Back ${counts.scroll}, links ${counts.links}.`, '')
  if (!diff.failures.length) lines.push('**Passed.** No finding beyond `scripts/shots/stability-baseline.json`.', '')
  else {
    lines.push(`**${diff.failures.length} new finding(s)** (frames in the \`a11y-report\` artifact, \`stability/\`):`, '')
    lines.push('| Check | Screen | Viewport | Finding | Value | Detail |', '|---|---|---|---|---|---|')
    for (const f of diff.failures) lines.push(`| ${f.check} | ${md(f.screen)} | ${f.viewport} | ${f.kind} | ${f.value} | ${md(f.detail)} |`)
    lines.push('')
  }
  if (diff.known.length) lines.push(`${diff.known.length} known finding(s) within the baseline.`, '')
  if (diff.improved.length) {
    lines.push('Improved (run `npm run stability:baseline` and commit the smaller baseline):', '')
    for (const i of diff.improved) lines.push(`- ${i.check} / ${i.screen} / ${i.viewport} / ${i.kind}: ${i.base} → ${i.value}`)
    lines.push('')
  }
  return lines.join('\n')
}

export function renderHtml({ diff, findings, skipped, seconds, mode }) {
  const row = f => `<tr class="${diff.failures.includes(f) ? 'fail' : 'known'}"><td>${esc(f.check)}</td><td>${esc(f.screen)}</td><td>${esc(f.viewport)}</td><td>${esc(f.kind)}</td><td>${f.value}</td><td>${esc(f.detail)}${f.steps ? `<br><small>${esc(f.steps)}</small>` : ''}${(f.frames ?? []).length ? `<div class="strip">${f.frames.map(p => `<figure><img src="${esc(p.file)}" loading="lazy"><figcaption>+${p.t} ms</figcaption></figure>`).join('')}</div>` : ''}</td></tr>`
  return `<!doctype html><meta charset="utf-8"><title>Stability check</title>
<style>body{font:14px system-ui;margin:24px;background:#13111F;color:#EDEAFF}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2C2848;padding:6px 8px;text-align:left;vertical-align:top}tr.fail td:first-child{border-left:4px solid #FF5555}tr.known{opacity:.7}.strip{display:flex;gap:6px;overflow-x:auto;margin-top:6px}figure{margin:0}img{height:260px;border:1px solid #2C2848}figcaption{font-size:11px;color:#8885A4}</style>
<h1>Stability check</h1><p>${esc(mode)} run in ${seconds} s. ${diff.failures.length} new, ${diff.known.length} known, ${diff.improved.length} improved.</p>
<table><tr><th>Check</th><th>Screen</th><th>Viewport</th><th>Finding</th><th>Value</th><th>Detail</th></tr>${findings.map(row).join('')}</table>
${skipped.length ? `<h2>Not exercised</h2><ul>${skipped.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}`
}
