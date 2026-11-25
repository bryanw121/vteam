/**
 * The rules behind scripts/shots/ui-consistency-flow.mjs (#377): the same kind of thing looks
 * and behaves the same on every screen. Pure, so `uiConsistency.test.mjs` checks them without a
 * browser: the flow measures each screen (`MEASURE_IN_PAGE`), `judge` counts what breaks a rule,
 * and `diffBaseline` compares the counts with `ui-consistency-baseline.json`
 * (screen → viewport → rule → count), which only shrinks.
 */

export const TAP_MIN = 44

/** Rule → what it checks and how to fix a finding (the job summary prints it). */
export const RULES = {
  'back-control': `A Back control smaller than ${TAP_MIN}×${TAP_MIN} pt. Use ScreenHeader's back (or the event page's 44-pt pill on a cover).`,
  'screen-title': 'A page title drawn by the native stack header (system font, purple) instead of ScreenHeader. Add the route to HEADERLESS_STACK_ROUTES and render <ScreenHeader>.',
  'font-family': 'Text that is not in Outfit (theme.fonts). The native stack header and a missing fontFamily fall back to the system or a serif face.',
  'font-token': 'A font size that is not a theme.font token (size, heading, emoji, watermark) at the default text size.',
  'tap-target-44': `On a phone, a button or link smaller than ${TAP_MIN} pt in either direction (inline text links excepted).`,
  'page-overflow': 'The page scrolls sideways (wider than the viewport).',
}

/** Icon fonts draw glyphs, not text: their family and size aren't type choices. */
const ICON_FONT = /^(ionicons|material|materialcommunityicons|fontawesome|feather|entypo|antdesign|octicons|simplelineicons|foundation|evilicons|zocial)/i
/** Fixed-width text (scoresheet numbers, code) is allowed off the Outfit family. */
const MONO = /mono|courier|consolas|menlo/i

/** Every number inside the `size`, `heading`, `emoji` and `watermark` blocks of theme.ts's `font`. */
export function fontTokensFrom(themeSource) {
  const at = themeSource.search(/\n\s{2,4}font:\s*\{/)
  if (at < 0) throw new Error('constants/theme.ts: no `font: {` block')
  // The font block up to its closing brace at the same depth.
  let depth = 0, end = themeSource.indexOf('{', at)
  for (let i = end; i < themeSource.length; i++) {
    if (themeSource[i] === '{') depth++
    else if (themeSource[i] === '}' && --depth === 0) { end = i; break }
  }
  const block = themeSource.slice(at, end)
  const sizes = new Set()
  for (const name of ['size', 'heading', 'emoji', 'watermark']) {
    const m = block.match(new RegExp(`\\b${name}:\\s*\\{([^}]*)\\}`))
    if (!m) continue
    for (const n of m[1].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').matchAll(/:\s*(\d+(?:\.\d+)?)/g)) sizes.add(Number(n[1]))
  }
  if (!sizes.size) throw new Error('constants/theme.ts: no font size tokens found')
  return [...sizes].sort((a, b) => a - b)
}

/**
 * Counts per rule for one measured screen (`m` from MEASURE_IN_PAGE), with a few
 * examples each for the summary. `viewport` is 'mobile' or 'desktop'.
 */
export function judge(m, { viewport, tokens }) {
  const counts = {}
  const examples = {}
  const add = (rule, example) => {
    counts[rule] = (counts[rule] ?? 0) + 1
    const list = (examples[rule] ??= [])
    if (list.length < 3 && example && !list.includes(example)) list.push(example)
  }
  const tokenSet = new Set(tokens)
  for (const b of m.backs ?? []) {
    if (b.w < TAP_MIN || b.h < TAP_MIN) add('back-control', `"${b.label}" ${b.w}×${b.h}`)
  }
  for (const t of m.nativeTitles ?? []) add('screen-title', `"${t.text}" ${t.size}px ${t.family}`)
  for (const t of m.texts ?? []) {
    if (ICON_FONT.test(t.family)) continue
    if (!/^outfit/i.test(t.family) && !MONO.test(t.family)) add('font-family', `"${t.text}" in ${t.family}`)
    if (!tokenSet.has(t.size)) add('font-token', `"${t.text}" ${t.size}px`)
  }
  if (viewport === 'mobile') {
    for (const c of m.controls ?? []) {
      if (c.inline) continue
      if (c.w < TAP_MIN || c.h < TAP_MIN) add('tap-target-44', `"${c.label}" ${c.w}×${c.h}`)
    }
  }
  if (m.docWidth > m.viewportWidth + 1) add('page-overflow', `${m.docWidth}px wide at ${m.viewportWidth}`)
  return { counts, examples }
}

/** Baseline from judged results: screen → viewport → rule → count. */
export function baselineFrom(results) {
  const b = {}
  for (const r of results) {
    for (const [rule, n] of Object.entries(r.counts)) {
      if (!n) continue
      ((b[r.screen] ??= {})[r.viewport] ??= {})[rule] = n
    }
  }
  return b
}

/**
 * New or worse findings fail (`failures`); counts under the baseline are `improved`
 * (shrink it with `npm run ui:baseline`). A screen that didn't load isn't judged, so
 * it can't count as improved.
 */
export function diffBaseline(results, baseline) {
  const failures = [], improved = []
  const seen = new Set()
  for (const r of results) {
    seen.add(`${r.screen}|${r.viewport}`)
    const base = baseline?.[r.screen]?.[r.viewport] ?? {}
    for (const [rule, n] of Object.entries(r.counts)) {
      if (n > (base[rule] ?? 0)) failures.push({ screen: r.screen, viewport: r.viewport, rule, count: n, base: base[rule] ?? 0, examples: r.examples[rule] ?? [] })
    }
    for (const [rule, n] of Object.entries(base)) {
      const now = r.counts[rule] ?? 0
      if (now < n) improved.push({ screen: r.screen, viewport: r.viewport, rule, count: now, base: n })
    }
  }
  return { failures, improved, judged: seen.size }
}

/** Totals per rule across every screen and viewport, for the summary table. */
export function totals(results) {
  const t = {}
  for (const r of results) for (const [rule, n] of Object.entries(r.counts)) t[rule] = (t[rule] ?? 0) + n
  return t
}

export function renderMarkdown({ results, diff, skipped = [] }) {
  const lines = []
  const ok = !diff.failures.length
  lines.push(`## ${ok ? '✅' : '❌'} UI consistency: ${ok ? 'nothing new beyond the baseline' : `${diff.failures.length} new finding(s)`}`)
  lines.push('', `${diff.judged} screen × viewport combinations judged against \`scripts/shots/ui-consistency-baseline.json\` (#377).`)
  if (diff.failures.length) {
    lines.push('', '### New', '', '| Rule | Screen | Viewport | Count (baseline) | Examples |', '| --- | --- | --- | --- | --- |')
    for (const f of diff.failures) lines.push(`| ${f.rule} | ${f.screen} | ${f.viewport} | ${f.count} (${f.base}) | ${f.examples.join('; ').replace(/\|/g, '\\|')} |`)
    lines.push('', 'What each rule wants:', '', ...[...new Set(diff.failures.map(f => f.rule))].map(r => `- **${r}**: ${RULES[r]}`))
  }
  if (diff.improved.length) {
    lines.push('', `### Fewer than the baseline (${diff.improved.length}): run \`npm run ui:baseline\` and commit the smaller baseline`, '')
    for (const i of diff.improved.slice(0, 30)) lines.push(`- ${i.screen} (${i.viewport}) ${i.rule}: ${i.base} → ${i.count}`)
  }
  const t = totals(results)
  lines.push('', '### Totals on this build', '', '| Rule | Count |', '| --- | --- |', ...Object.keys(RULES).map(r => `| ${r} | ${t[r] ?? 0} |`))
  if (skipped.length) lines.push('', `Not judged (the screen didn't load): ${skipped.join(', ')}`)
  return lines.join('\n') + '\n'
}

/**
 * Runs in the page (Playwright `evaluate`): what the rules need, from the computed styles.
 * Only what is on screen counts (inside the viewport, visible).
 */
export const MEASURE_IN_PAGE = () => {
  const visible = el => {
    const b = el.getBoundingClientRect()
    if (b.width <= 0 || b.height <= 0 || b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) return false
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
    }
    return true
  }
  const fam = el => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()
  const short = s => s.replace(/\s+/g, ' ').trim().slice(0, 40)

  const texts = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim()
    if (!text || !n.parentElement || !visible(n.parentElement)) continue
    if (n.parentElement.closest('svg, script, style, noscript')) continue
    texts.push({ text: short(text), family: fam(n.parentElement), size: parseFloat(getComputedStyle(n.parentElement).fontSize) })
  }

  const label = el => short(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '')
  const controls = []
  for (const el of document.querySelectorAll('[role=button], button, a[href], [role=link], [role=tab], [role=switch], [role=checkbox], [role=radio]')) {
    if (!visible(el) || el.parentElement?.closest('[role=button], button, a[href], [role=link]')) continue
    const b = el.getBoundingClientRect()
    // A link inside running text: its box is the words, by design.
    const inline = getComputedStyle(el).display === 'inline' || !!el.closest('p')
    controls.push({ label: label(el), w: Math.round(b.width), h: Math.round(b.height), inline })
  }
  const backs = controls.filter(c => /^(back|go back|back to )/i.test(c.label))

  const nativeTitles = [...document.querySelectorAll('[role=heading][aria-level="1"]')]
    .filter(el => visible(el) && !el.closest('[data-testid=screen-title]'))
    .map(el => ({ text: short(el.textContent), size: parseFloat(getComputedStyle(el).fontSize), family: fam(el) }))

  return { texts, controls, backs, nativeTitles, docWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }
}
