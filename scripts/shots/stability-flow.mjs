#!/usr/bin/env node
/**
 * Stability check (#255): the bug class tests used to miss, in the real web
 * export with every Supabase call mocked.
 *
 * - tours: the intro tour reads "1 of N", "2 of N", ... with a spotlight on every
 *   step, under every Events filter state (from a link and saved), started from
 *   Profile and from the Austin banner (#249).
 * - scroll: refresh and Back on long screens never paint at one offset and jump,
 *   Back comes back to the same place, nothing shifts after the splash, content
 *   doesn't vanish and spinners don't return (#250, #254).
 * - links: every `VIEW` link keeps its values, a change follows into the address,
 *   and phone tab switches keep each tab's view.
 *
 * Findings are compared with scripts/shots/stability-baseline.json; a new or
 * worse one fails (after one confirming re-run, for runner noise). PR mode is a
 * subset sized for CI; --full runs every combination, also with every Supabase
 * response delayed 800 ms.
 *
 *   node scripts/shots/stability-flow.mjs --dist dist-mock [--out stability-report] [--full] [--only tours,scroll,links] [--update-baseline] [--concurrency 4]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow, TIME_ZONE } from './fixtures/time.mjs'
import { LINK_CASES, SCROLL_SCREENS, tourCases } from './stabilityCases.mjs'
import { analyzeSamples, baselineFrom, confirmFailures, diffBaseline, paramMismatches, renderHtml, renderMarkdown, tourFindings } from './lib/stability.mjs'

const args = parseArgs(process.argv.slice(2))
const full = !!args.full
const only = args.only ? String(args.only).split(',') : ['tours', 'scroll', 'links']
const out = resolve(args.out || 'stability-report')
const concurrency = Number(args.concurrency ?? 4)
const BASELINE = resolve('scripts/shots/stability-baseline.json')
const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 860 } },
}
const seenIds = loadSeenIds(process.cwd())
const relationships = loadRelationships(process.cwd())
const now = defaultNow()

await mkdir(join(out, 'frames'), { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
const started = Date.now()
let browser

async function newPage(viewport, { signedIn = true, delay = 0, init, seen = seenIds } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[viewport], timezoneId: TIME_ZONE, locale: 'en-US' })
  const page = await context.newPage()
  if (init) await page.addInitScript(init)
  await installSupabaseMock(page, { now, signedIn, seenIds: seen, relationships })
  if (delay) {
    await page.route(/shotsmock\.supabase\.co/, async route => {
      if (route.request().method() !== 'OPTIONS') await new Promise(r => setTimeout(r, delay))
      await route.fallback()
    })
  }
  return { context, page }
}

/** The app tree mounts under the splash; wait until the splash is gone. */
const splashGone = (page, timeout = 40000) => page.getByText('BETA', { exact: true }).waitFor({ state: 'detached', timeout }).catch(() => {})

async function pool(items, fn) {
  const results = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]) }
  }))
  return results
}

// ── Tours ────────────────────────────────────────────────────────────────────

async function walkTour(c, delay) {
  const init = c.mode === 'saved' ? `try { localStorage.setItem('vteam.feedFilters', ${JSON.stringify(JSON.stringify({ filter: c.type, surface: c.surface }))}) } catch {}` : undefined
  const signedIn = c.start === 'profile'
  const { context, page } = await newPage(c.viewport, { signedIn, delay, init, seen: signedIn ? seenIds : [] })
  const steps = []
  let error = null
  try {
    await page.goto(`${server.url}${c.mode === 'link' ? `/?type=${c.type}&surface=${c.surface}` : '/'}`, { waitUntil: 'load' })
    await splashGone(page)
    if (signedIn) {
      await page.waitForTimeout(1000 + delay)
      await page.goto(`${server.url}/profile`, { waitUntil: 'load' })
      await splashGone(page)
      await page.getByTestId('take-tour').filter({ visible: true }).first().click({ timeout: 20000 })
    } else {
      await page.getByText('Check out our tour').filter({ visible: true }).first().click({ timeout: 20000 })
    }
    for (let i = 0; i < 12; i++) {
      const card = page.getByTestId('tour-card').filter({ visible: true }).first()
      if (!(await card.waitFor({ timeout: 8000 }).then(() => true, () => false))) break
      await page.waitForTimeout(400)
      const text = await card.innerText()
      const m = text.match(/(\d+) of (\d+)/)
      const spot = page.getByTestId('tour-spotlight').filter({ visible: true }).first()
      const box = await spot.boundingBox().catch(() => null)
      steps.push({ n: m ? Number(m[1]) : null, of: m ? Number(m[2]) : null, spot: !!box && box.width >= 4 && box.height >= 4 })
      await page.getByTestId('tour-next').filter({ visible: true }).first().click()
      if (m && m[1] === m[2]) break
    }
  } catch (e) { error = String(e).split('\n')[0] }
  const caseId = `${c.start}:${c.mode}:${c.type}:${c.surface}`
  const findings = tourFindings(steps).map(f => ({
    check: 'tours', screen: `intro:${c.start}`, viewport: c.viewport, caseId, ...f, kind: delay ? `${f.kind}@slow` : f.kind,
    detail: `${f.detail} (${c.mode} ${c.type}/${c.surface}${delay ? `, ${delay} ms` : ''})${error ? `; ${error}` : ''}`,
  }))
  if (findings.length) {
    const file = `frames/tour-${c.viewport}-${caseId.replace(/:/g, '-')}.png`
    await page.screenshot({ path: join(out, file) }).catch(() => {})
    findings.forEach(f => { f.frames = [{ file, t: 0 }] })
  }
  await context.close()
  return findings
}

// ── Refresh and Back ────────────────────────────────────────────────────────

/** Runs in the page: every ~60 ms, where it is scrolled to, whether the splash is up, what is painted, and layout shifts with their nodes. */
const SAMPLER = () => {
  if (window.__stability) return
  const st = window.__stability = { t0: performance.now(), samples: [], shifts: [], scrollers: [], lastScan: -1e9 }
  const describe = node => {
    if (!node || !node.getAttribute) return node?.nodeName || '?'
    const tagged = node.closest && node.closest('[data-testid]')
    return `${tagged ? `[${tagged.getAttribute('data-testid')}] ` : ''}${node.tagName.toLowerCase()} "${(node.innerText || '').trim().slice(0, 40).replace(/\s+/g, ' ')}"`
  }
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        st.shifts.push({ t: e.startTime - st.t0, v: e.value, input: e.hadRecentInput, src: (e.sources || []).map(s => ({ n: describe(s.node), dy: s.currentRect.y - s.previousRect.y, dh: s.currentRect.height - s.previousRect.height })) })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {}
  const scan = () => {
    st.scrollers = [...document.querySelectorAll('div')].filter(d => {
      const s = getComputedStyle(d)
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 20 && d.clientHeight > 300
    })
  }
  const tick = () => {
    const t = performance.now()
    if (t - st.lastScan > 300) { scan(); st.lastScan = t }
    let inner = 0
    for (const d of st.scrollers) if (d.isConnected && d.offsetParent !== null && d.scrollTop > inner) inner = d.scrollTop
    const splash = [...document.querySelectorAll('div')].some(d => d.childElementCount === 0 && d.textContent === 'BETA' && d.offsetParent !== null)
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    const painted = !splash && !!hit && hit !== document.body && hit !== document.documentElement && (hit.innerText || '').trim().length > 0
    const spinners = [...document.querySelectorAll('[role=progressbar]')].filter(e => e.offsetParent !== null).length
    st.samples.push({ t: Math.round(t - st.t0), y: Math.round(scrollY), inner: Math.round(inner), text: document.body.innerText.length, splash, painted, spinners })
    if (t - st.t0 < 4000) setTimeout(tick, 60)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick)
  else tick()
}

const currentOffset = page => page.evaluate(() => {
  let inner = 0
  for (const d of document.querySelectorAll('div')) if (d.offsetParent !== null && d.scrollTop > inner) inner = d.scrollTop
  return Math.max(scrollY, inner)
})

function childLocator(page, child) {
  if (child.text) return page.getByText(child.text, { exact: true }).filter({ visible: true })
  return page.locator(`[data-testid^="${child.testIdPrefix}"]`).filter({ visible: true })
}

/** Scroll partway (or the child into the middle), returning the offset, or null when the page doesn't scroll. */
async function scrollPartway(page, viewport, child) {
  if (child) {
    const all = childLocator(page, child)
    const count = await all.count()
    if (count) {
      const target = child.last ? all.nth(count - 1) : all.nth(Math.min(child.nth ?? 0, count - 1))
      await target.evaluate(el => el.scrollIntoView({ block: 'center' })).catch(() => {})
      await page.waitForTimeout(600)
      const y = await currentOffset(page)
      if (y >= 50) return { y, target }
    }
  }
  await page.mouse.move(viewport === 'phone' ? 195 : 800, 500)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(60) }
  await page.waitForTimeout(800)
  const y = await currentOffset(page)
  return y >= 50 ? { y, target: null } : null
}

/** Screencast frames for `ms` from now (CDP), started before `action`. */
async function recordFrames(page, ms, action) {
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', async f => {
    frames.push({ at: Date.now(), data: f.data })
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, everyNthFrame: 2 })
  const t0 = Date.now()
  await action()
  await page.waitForTimeout(ms)
  await cdp.send('Page.stopScreencast').catch(() => {})
  return frames.filter(f => f.at >= t0).map(f => ({ t: f.at - t0, data: f.data }))
}

async function scrollCase(c, delay, skipped) {
  const { context, page } = await newPage(c.viewport, { signedIn: c.signedIn, delay })
  const who = c.signedIn ? 'in' : 'guest'
  const caseId = `${c.screen}:${who}:${c.nav}${delay ? `:d${delay}` : ''}`
  let findings = []
  try {
    await page.goto(server.url + c.path, { waitUntil: 'load' })
    await splashGone(page)
    await page.waitForTimeout(2000 + delay * 2)
    const at = await scrollPartway(page, c.viewport, c.nav === 'back' ? c.child : null)
    if (!at) { skipped.push(`${c.screen} (${c.viewport}, ${who}, ${c.nav}): the page doesn't scroll with the fixtures`); return [] }
    if (c.nav === 'back' && !at.target) { skipped.push(`${c.screen} (${c.viewport}, ${who}): Back not exercised, no child link partway down`); return [] }
    let frames
    if (c.nav === 'reload') {
      await page.addInitScript(SAMPLER)
      frames = await recordFrames(page, 3000 + delay, () => page.reload({ waitUntil: 'commit' }))
    } else {
      const before = new URL(page.url()).pathname
      await at.target.click({ timeout: 5000 })
      await page.waitForURL(u => u.pathname !== before, { timeout: 5000 }).catch(() => {})
      if (new URL(page.url()).pathname === before) { skipped.push(`${c.screen} (${c.viewport}, ${who}): the child link didn't navigate`); return [] }
      await page.waitForTimeout(1000 + delay)
      await page.evaluate(SAMPLER)
      await page.evaluate(() => { const st = window.__stability; st.t0 = performance.now(); st.samples = []; st.shifts = [] })
      frames = await recordFrames(page, 3000 + delay, () => page.goBack({ waitUntil: 'commit' }))
    }
    const st = await page.evaluate(() => window.__stability)
    findings = analyzeSamples({ samples: st?.samples, shifts: st?.shifts, nav: c.nav, target: c.nav === 'back' ? at.y : null })
      .map(f => ({ check: 'scroll', screen: c.screen, viewport: c.viewport, caseId, ...f, kind: delay ? `${f.kind}@slow` : f.kind, detail: `${f.detail} (${who}${delay ? `, ${delay} ms` : ''})` }))
    if (findings.length) {
      const picked = pickFrames(frames, 8)
      const stored = []
      for (const [i, f] of picked.entries()) {
        const file = `frames/${c.viewport}-${caseId.replace(/:/g, '-')}-${i}.jpg`
        await writeFile(join(out, file), Buffer.from(f.data, 'base64'))
        stored.push({ file, t: f.t })
      }
      findings.forEach(f => { f.frames = stored })
    }
  } catch (e) {
    findings = [{ check: 'scroll', screen: c.screen, viewport: c.viewport, caseId, kind: `${c.nav}:error`, value: 1, detail: String(e).split('\n')[0] }]
  } finally {
    await context.close()
  }
  return findings
}

/** Up to `n` frames, the first ones (where flicker happens) densely, the rest spread out. */
function pickFrames(frames, n) {
  if (frames.length <= n) return frames
  const head = frames.slice(0, Math.ceil(n / 2))
  const rest = frames.slice(head.length)
  const step = rest.length / (n - head.length)
  return [...head, ...Array.from({ length: n - head.length }, (_, i) => rest[Math.floor(i * step)])]
}

function scrollCases(full) {
  const cases = []
  for (const s of SCROLL_SCREENS) {
    if (!full && !s.pr) continue
    for (const viewport of ['phone', 'desktop']) for (const signedIn of s.guest ? [true, false] : [true]) for (const nav of ['reload', 'back']) {
      if (nav === 'back' && !s.child) continue
      if (!full && !signedIn && s.screen !== 'events') continue
      cases.push({ ...s, viewport, signedIn, nav })
    }
  }
  return cases
}

// ── Links ───────────────────────────────────────────────────────────────────

const TAB_LABEL = { events: 'Events', clubs: 'Clubs', chat: 'Chat', profile: 'Me' }
const TAB_PATH = { '/': 'events', '/clubs': 'clubs', '/chat': 'chat', '/profile': 'profile' }

function fillDays(value) {
  const day2 = new Date(now.getTime() + 2 * 864e5).toLocaleDateString('en-CA', { timeZone: TIME_ZONE })
  return typeof value === 'string' ? value.replaceAll('{day2}', day2) : value
}

async function tapTab(page, key) {
  // The tab bar is the lowest element with that label (the page may show the same word higher up).
  const labels = page.getByText(TAB_LABEL[key], { exact: true }).filter({ visible: true })
  let best = null
  for (let i = 0; i < await labels.count(); i++) {
    const b = await labels.nth(i).boundingBox()
    if (b && (!best || b.y > best.y)) best = b
  }
  if (!best) throw new Error(`no ${TAB_LABEL[key]} tab`)
  await page.mouse.click(best.x + best.width / 2, best.y + best.height / 2)
}

async function linkCase(c, viewport) {
  const { context, page } = await newPage(viewport, { signedIn: !c.guest })
  const params = () => Object.fromEntries(new URL(page.url()).searchParams)
  const fill = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fillDays(v)]))
  const problems = []
  try {
    await page.goto(server.url + fillDays(c.path), { waitUntil: 'load' })
    await splashGone(page)
    await page.waitForTimeout(2500)
    problems.push(...paramMismatches(params(), fill(c.keep)).map(p => `on open, ${p}`))
    if (c.expectText && !(await page.getByText(c.expectText, { exact: true }).filter({ visible: true }).count())) problems.push(`"${c.expectText}" not on screen`)
    if (c.change) {
      const ch = c.change
      const loc = ch.role ? page.getByRole(ch.role, { name: ch.text }) : ch.testId ? page.getByTestId(ch.testId) : page.getByText(ch.text, { exact: ch.exact ?? true })
      await loc.filter({ visible: true }).first().click({ timeout: 8000 })
      await page.waitForTimeout(1200)
      problems.push(...paramMismatches(params(), c.after).map(p => `after the change, ${p}`))
    }
    if (c.tabSwitch && viewport === 'phone') {
      const before = params()
      const path = new URL(page.url()).pathname
      await tapTab(page, c.tabSwitch)
      await page.waitForTimeout(1200)
      await tapTab(page, TAB_PATH[path])
      await page.waitForTimeout(1500)
      problems.push(...paramMismatches(params(), before).map(p => `after switching tabs, ${p}`))
    }
  } catch (e) { problems.push(String(e).split('\n')[0]) }
  const findings = problems.map(p => ({ check: 'links', screen: `${c.view}:${c.path.split('?')[1] ?? ''}`, viewport, caseId: c.path, kind: 'link', value: 1, detail: p }))
  if (findings.length) {
    const file = `frames/link-${c.view}-${viewport}.png`
    await page.screenshot({ path: join(out, file) }).catch(() => {})
    findings.forEach(f => { f.frames = [{ file, t: 0 }] })
  }
  await context.close()
  return findings
}

// ── Run ─────────────────────────────────────────────────────────────────────

const skipped = []
const counts = { tours: 0, scroll: 0, links: 0, cases: 0 }
const ran = new Set()
const jobs = []
const delays = full ? [0, 800] : [0]
if (full) ran.add('@slow')
if (only.includes('tours')) for (const d of delays) for (const c of tourCases(full)) {
  jobs.push({ key: `tours:${c.viewport}:${c.start}:${c.mode}:${c.type}:${c.surface}:${d}`, run: () => walkTour(c, d) })
  ran.add(`tours|intro:${c.start}|${c.viewport}`); counts.tours++
}
if (only.includes('scroll')) for (const d of delays) for (const c of scrollCases(full)) {
  jobs.push({ key: `scroll:${c.screen}:${c.viewport}:${c.signedIn}:${c.nav}:${d}`, run: () => scrollCase(c, d, skipped) })
  ran.add(`scroll|${c.screen}|${c.viewport}`); counts.scroll++
}
if (only.includes('links')) for (const c of LINK_CASES) for (const viewport of ['phone', 'desktop']) {
  jobs.push({ key: `links:${c.path}:${viewport}`, run: () => linkCase(c, viewport) })
  ran.add(`links|${c.view}:${c.path.split('?')[1] ?? ''}|${viewport}`); counts.links++
}
counts.cases = jobs.length

let baseline = {}
if (existsSync(BASELINE)) baseline = JSON.parse(await readFile(BASELINE, 'utf8'))

let exitCode = 0
try {
  browser = await launchChromium()
  const results = await pool(jobs, j => j.run())
  let findings = results.flat()
  let diff = diffBaseline(findings, baseline, ran)
  // Re-run each case with a new or worse finding once; keep only what it shows again.
  const retry = jobs.filter((j, i) => results[i].some(f => diff.failures.includes(f)))
  if (retry.length && !args['update-baseline']) {
    const again = (await pool(retry, j => j.run())).flat()
    const confirmed = confirmFailures(diff.failures, again)
    findings = [...diff.known, ...confirmed]
    diff = diffBaseline(findings, baseline, ran)
  }
  const seconds = Math.round((Date.now() - started) / 1000)
  const mode = full ? 'Full' : 'PR'
  if (args['update-baseline']) {
    const next = baselineFrom(findings, baseline._notes ?? {})
    await writeFile(BASELINE, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`Wrote ${BASELINE} (${findings.length} finding(s)).`)
  }
  await writeFile(join(out, 'stability.json'), JSON.stringify({ mode, seconds, counts, findings: findings.map(({ frames, ...f }) => ({ ...f, frames: frames?.map(x => x.file) })), skipped, improved: diff.improved }, null, 2))
  await writeFile(join(out, 'summary.md'), renderMarkdown({ diff, counts, seconds, mode }) + (skipped.length ? `\nNot exercised: ${skipped.length} (listed in the report).\n` : ''))
  await writeFile(join(out, 'index.html'), renderHtml({ diff, findings, skipped, seconds, mode }))
  console.log(`${mode} run: ${counts.cases} cases in ${seconds} s. New: ${diff.failures.length}, known: ${diff.known.length}, improved: ${diff.improved.length}. Report: ${join(out, 'index.html')}`)
  for (const f of diff.failures) console.log(`  NEW ${f.check} ${f.screen} ${f.viewport} ${f.kind} ${f.value}: ${f.detail}`)
  for (const s of skipped) console.log(`  skipped: ${s}`)
  if (diff.failures.length && !args['update-baseline']) exitCode = 1
} finally {
  await browser?.close()
  server.close?.()
}
process.exit(exitCode)
