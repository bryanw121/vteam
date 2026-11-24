#!/usr/bin/env node
/**
 * Production watch (#353). Every other watch looks at the database or its API;
 * this one looks at the site players open:
 *
 * 1. **Live is main.** Reads `<site>/version.json` (written by
 *    scripts/build-version.mjs in every web build) and compares it with the head
 *    of `main`. If live serves another commit and main's head is older than
 *    GRACE_MINUTES, it fails with the reason, from GitHub's Production deployment
 *    and the "Live schema ready" check: Vercel skipped the build (Nov 14–16: five
 *    merged PRs never deployed for 29.5 h after #315's ignore step), the build
 *    failed (Nov 18: #325's build gave up waiting for its migration, live stayed
 *    behind 9.5 h), it's still building, or it deployed but isn't served. While
 *    the schema check is still waiting for a migration it only reports, since
 *    that check fails (and emails) on its own after 3 hours.
 * 2. **A guest can open it.** Real Chromium, phone (390×844) and desktop
 *    (1280×860), never signed in: Events shows cards, a card opens the outside
 *    session sheet, Tournaments / Leagues / Terms render, and none of them shows
 *    the crash screen, a page error or React #418. Plus the event link preview
 *    (og tags and image) and the two Edge routes.
 *
 * Read-only: GitHub's API (GITHUB_TOKEN when set), anonymous page loads, and one
 * anon read of live's newest event for the preview check. The browser reports
 * `navigator.webdriver`, so the app's analytics stay off. Failing checks are
 * tried once more after --retry-wait seconds before the run fails. Writes a table
 * to the GitHub job summary, screenshots of failed steps to --out, and exits 1
 * on any failure, so GitHub emails the repo owner (like server-health).
 *
 *   node scripts/production-watch.mjs                       full run against live
 *   node scripts/production-watch.mjs --skip-browser        deploy + HTTP checks only
 *   node scripts/production-watch.mjs --site http://localhost:8081 --skip-deploy
 *   node scripts/production-watch.mjs --retry-wait 0        (local runs)
 *   node scripts/production-watch.mjs --dist dist-mock --retry-wait 0
 *       self-test of the browser steps on the mocked export (CI's Browser: flows)
 */
import { appendFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PROJECTS } from './schema-drift.mjs'

export const SITE = 'https://vteamvolleyball.com'
export const REPO = 'bryanw121/vteam'
/** A normal deploy takes 4–6 minutes after the merge; the schema gate can add more. */
export const GRACE_MINUTES = 40
export const SCHEMA_CHECK = 'Live schema ready'
const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 860 } },
}
const CARD_SELECTOR = '[data-testid="external-session-card"], [data-testid="event-card"], [data-testid="external-program-card"]'
const CRASH_TITLES = ['This screen hit a snag', 'Still not working']

const short = sha => (sha ? String(sha).slice(0, 7) : '?')
const minutes = ms => Math.round(ms / 60000)

/**
 * Pure: is live serving main, and if not, why? `deployment` is the newest
 * Production deployment for main's head ({ state, url, at } or null when there
 * is none); `schemaCheck` is that commit's "Live schema ready" check run
 * ({ status, conclusion } or null). Returns { status: 'ok' | 'waiting' | 'fail', message }.
 */
export function judgeDeploy({ head, served, deployment = null, schemaCheck = null, behind = null, now = Date.now(), graceMinutes = GRACE_MINUTES }) {
  const headAt = Date.parse(head.at)
  const age = minutes(now - headAt)
  const servedSha = served?.sha ?? null
  if (servedSha && (head.sha.startsWith(servedSha) || servedSha.startsWith(head.sha))) {
    return { status: 'ok', message: `live serves ${short(head.sha)}, the head of main` }
  }
  const servedText = servedSha ? `live serves ${short(servedSha)}${behind != null ? ` (${behind} commit${behind === 1 ? '' : 's'} behind)` : ''}` : `live has no readable version.json${served?.error ? ` (${served.error})` : ''}`
  const lead = `main ${short(head.sha)} landed ${age} min ago; ${servedText}`
  if (age < graceMinutes) return { status: 'waiting', message: `${lead}. Deploying (allowed ${graceMinutes} min).` }
  if (schemaCheck && schemaCheck.status !== 'completed') {
    return { status: 'waiting', message: `${lead}. "${SCHEMA_CHECK}" is still waiting for a migration on live; the deploy waits for it (that check fails on its own after 3 h).` }
  }
  if (schemaCheck && schemaCheck.conclusion && !['success', 'skipped', 'neutral'].includes(schemaCheck.conclusion)) {
    return { status: 'fail', message: `${lead}. "${SCHEMA_CHECK}" ended ${schemaCheck.conclusion}: apply the migration on live, then redeploy.` }
  }
  if (!deployment) {
    return { status: 'fail', message: `${lead}. There is no Production deployment for ${short(head.sha)}: Vercel skipped the build (check vercel.json's ignoreCommand and the Vercel project's Ignored Build Step).` }
  }
  const depAge = deployment.at ? minutes(now - Date.parse(deployment.at)) : null
  if (deployment.state === 'failure' || deployment.state === 'error') {
    const gate = schemaCheck?.conclusion === 'success' ? ' If it gave up waiting for a migration that is on live now, redeploy.' : ''
    return { status: 'fail', message: `${lead}. Its Production build failed${deployment.url ? ` (${deployment.url})` : ''}.${gate}` }
  }
  if (deployment.state === 'success' && !servedSha) {
    return { status: 'fail', message: `${lead}. Vercel reports ${short(head.sha)} deployed${depAge != null ? ` ${depAge} min ago` : ''}, but live's version.json can't be read: is the site up, and does the build still run scripts/build-version.mjs?` }
  }
  if (deployment.state === 'success') {
    return { status: 'fail', message: `${lead}. Vercel reports ${short(head.sha)} deployed${depAge != null ? ` ${depAge} min ago` : ''}, but the site doesn't serve it: check the production domain's alias.` }
  }
  // queued / pending / in_progress / inactive
  if (depAge != null && depAge < graceMinutes) {
    return { status: 'waiting', message: `${lead}. Production deployment is ${deployment.state} (${depAge} min).` }
  }
  return { status: 'fail', message: `${lead}. Production deployment has been ${deployment.state}${depAge != null ? ` for ${depAge} min` : ''}.` }
}

/** Pure: the meta tags of an HTML page, as { property|name: content }. */
export function metaTags(html) {
  const out = {}
  for (const m of String(html).matchAll(/<meta\s+([^>]+?)\/?>/gi)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([a-zA-Z:_-]+)\s*=\s*"([^"]*)"/g)].map(a => [a[1].toLowerCase(), a[2]]))
    const key = attrs.property ?? attrs.name
    if (key && attrs.content != null) out[key] = attrs.content.replace(/&amp;/g, '&')
  }
  return out
}

/** Pure: errors from a page that mean it's broken for players. */
export function seriousErrors(errors) {
  return errors.filter(e => /Minified React error #418|Hydration|is not a function|is not defined|Cannot read propert|undefined is not|ChunkLoadError|Loading chunk/i.test(e) || e.startsWith('pageerror:'))
}

// ── Network helpers ───────────────────────────────────────────────────────────

async function gh(path, token) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status}`)
  return res.json()
}

async function fetchText(url, init = {}) {
  const res = await fetch(url, { redirect: 'follow', ...init, signal: AbortSignal.timeout(20_000) })
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() }
}

async function servedVersion(site) {
  try {
    const r = await fetchText(`${site}/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (r.status !== 200) return { sha: null, error: `HTTP ${r.status}` }
    const body = JSON.parse(r.text)
    return { sha: typeof body.sha === 'string' && body.sha !== 'unknown' ? body.sha : null, error: body.sha ? undefined : 'no sha' }
  } catch (e) {
    return { sha: null, error: e instanceof SyntaxError ? 'not JSON (the SPA page?)' : String(e.message ?? e) }
  }
}

export async function deployCheck({ site, repo, token, now = Date.now() }) {
  const commit = await gh(`repos/${repo}/commits/main`, token)
  const head = { sha: commit.sha, at: commit.commit.committer.date }
  const served = await servedVersion(site)
  let deployment = null
  let schemaCheck = null
  let behind = null
  const inSync = served.sha && head.sha.startsWith(served.sha)
  if (!inSync) {
    const deps = await gh(`repos/${repo}/deployments?sha=${head.sha}&environment=Production&per_page=5`, token)
    if (deps.length) {
      const statuses = await gh(`repos/${repo}/deployments/${deps[0].id}/statuses?per_page=1`, token)
      const s = statuses[0]
      deployment = { state: s?.state ?? 'pending', url: s?.log_url || s?.target_url || null, at: s?.created_at ?? deps[0].created_at }
    }
    const runs = await gh(`repos/${repo}/commits/${head.sha}/check-runs?check_name=${encodeURIComponent(SCHEMA_CHECK)}`, token)
    const run = runs.check_runs?.[0]
    if (run) schemaCheck = { status: run.status, conclusion: run.conclusion }
    if (served.sha) {
      try { behind = (await gh(`repos/${repo}/compare/${served.sha}...${head.sha}`, token)).ahead_by } catch { /* unknown commit */ }
    }
  }
  const verdict = judgeDeploy({ head, served, deployment, schemaCheck, behind, now })
  return { name: 'Live runs main', ok: verdict.status !== 'fail', waiting: verdict.status === 'waiting', detail: verdict.message }
}

async function httpChecks(site) {
  const results = []
  // Event link preview: the newest public event that isn't cancelled (anon read on live).
  try {
    const { url, key } = PROJECTS.live
    const res = await fetch(`${url}/rest/v1/events?select=id&cancelled_at=is.null&order=event_date.desc&limit=1`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) })
    const rows = res.ok ? await res.json() : []
    if (!rows.length) {
      results.push({ name: 'Event link preview', ok: true, detail: res.ok ? 'no event to preview (skipped)' : `couldn't read events (HTTP ${res.status}); skipped` })
    } else {
      const page = await fetchText(`${site}/event/${rows[0].id}`)
      const meta = metaTags(page.text)
      const image = meta['og:image'] ? await fetch(meta['og:image'], { signal: AbortSignal.timeout(30_000) }) : null
      const ok = page.status === 200 && !!meta['og:title'] && !!image && image.ok && /image\//.test(image.headers.get('content-type') ?? '')
      results.push({ name: 'Event link preview', ok, detail: ok ? `og:title "${meta['og:title'].slice(0, 60)}", og:image ${image.status}` : `page ${page.status}, og:title ${meta['og:title'] ? 'yes' : 'missing'}, og:image ${image ? image.status : 'missing'}` })
    }
  } catch (e) {
    results.push({ name: 'Event link preview', ok: false, detail: String(e.message ?? e) })
  }
  for (const [name, path, okStatuses] of [['/api/where', '/api/where', [200]], ['/api/forecast', '/api/forecast?lat=30.26&lng=-97.75', [200, 204]]]) {
    try {
      const r = await fetchText(`${site}${path}`)
      results.push({ name, ok: okStatuses.includes(r.status), detail: `HTTP ${r.status}` })
    } catch (e) {
      results.push({ name, ok: false, detail: String(e.message ?? e) })
    }
  }
  return results
}

// ── Browser ───────────────────────────────────────────────────────────────────

async function visit(browser, site, size, path, out, fn, prepare) {
  const ctx = await browser.newContext(VIEWPORTS[size])
  const page = await ctx.newPage()
  if (prepare) await prepare(page)
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const label = `${path} (${size})`
  try {
    const started = Date.now()
    const res = await page.goto(`${site}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status() ?? 'no response'}`)
    const detail = await fn(page, started)
    const crash = await page.evaluate(titles => titles.find(t => document.body.innerText.includes(t)) ?? null, CRASH_TITLES)
    if (crash) throw new Error(`crash screen: "${crash}"`)
    const serious = seriousErrors(errors)
    if (serious.length) throw new Error(`${serious.length} page error(s): ${serious[0].slice(0, 160)}`)
    return { name: label, ok: true, detail }
  } catch (e) {
    const shot = join(out, `${size}-${path.replace(/[^a-z0-9]+/gi, '_') || 'root'}.png`)
    await page.screenshot({ path: shot }).catch(() => {})
    return { name: label, ok: false, detail: `${String(e.message ?? e).split('\n')[0]} (screenshot ${shot.split('/').pop()})` }
  } finally {
    await ctx.close()
  }
}

async function browserChecks(site, out, prepare) {
  const { launchChromium } = await import('./shots/capture.mjs')
  const browser = await launchChromium()
  const results = []
  const go = (size, path, fn) => visit(browser, site, size, path, out, fn, prepare)
  try {
    for (const size of ['phone', 'desktop']) {
      results.push(await go(size, '/', async (page, started) => {
        const first = page.locator(CARD_SELECTOR).first()
        await first.waitFor({ state: 'visible', timeout: 25_000 })
        const ms = Date.now() - started
        await page.waitForTimeout(1500)
        const n = await page.locator(CARD_SELECTOR).count()
        let sheet = ''
        if (size === 'phone') {
          const session = page.locator('[data-testid="external-session-card"]').first()
          if (await session.count()) {
            await session.click()
            await page.locator('[data-testid="outside-session-sheet"]').waitFor({ state: 'visible', timeout: 10_000 })
            if (!/[?&]session=/.test(page.url())) throw new Error('the session sheet opened but the address has no ?session=')
            sheet = ', session sheet opens (?session= in the address)'
          } else {
            sheet = ', no outside session to open'
          }
        }
        return `${n} cards, first at ${(ms / 1000).toFixed(1)} s${sheet}`
      }))
    }
    for (const [path, text] of [['/tournaments', 'Tournaments'], ['/leagues', 'Leagues'], ['/terms', 'Terms']]) {
      results.push(await go('phone', path, async page => {
        await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 25_000 })
        await page.waitForTimeout(1500)
        return `shows "${text}"`
      }))
    }
  } finally {
    await browser.close()
  }
  return results
}

// ── Run ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { site: SITE, repo: REPO, retryWait: 60, out: 'production-watch', browser: true, deploy: true, http: true, dist: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--site') o.site = argv[++i].replace(/\/+$/, '')
    else if (a === '--repo') o.repo = argv[++i]
    else if (a === '--retry-wait') o.retryWait = Number(argv[++i])
    else if (a === '--out') o.out = argv[++i]
    else if (a === '--skip-browser') o.browser = false
    else if (a === '--skip-deploy') o.deploy = false
    else if (a === '--dist') o.dist = argv[++i]
  }
  return o
}

/** Pure: the job summary table. */
export function renderSummary(results, site) {
  const failed = results.filter(r => !r.ok)
  const head = failed.length ? `**${failed.length} check${failed.length === 1 ? '' : 's'} failed** on ${site}.` : `**All checks passed** on ${site}.`
  const rows = results.map(r => `| ${r.name} | ${r.ok ? (r.waiting ? 'waiting' : 'ok') : '**FAIL**'} | ${String(r.detail).replace(/\|/g, '\\|')} |`)
  return ['## Production watch', '', head, '', '| Check | Result | Detail |', '| --- | --- | --- |', ...rows, ''].join('\n')
}

async function runAll(o, only = null) {
  const want = name => !only || only.has(name)
  const results = []
  if (o.deploy && want('deploy')) {
    try {
      results.push({ ...(await deployCheck({ site: o.site, repo: o.repo, token: process.env.GITHUB_TOKEN })), group: 'deploy' })
    } catch (e) {
      results.push({ name: 'Live runs main', ok: false, detail: String(e.message ?? e), group: 'deploy' })
    }
  }
  if (o.http && want('http')) results.push(...(await httpChecks(o.site)).map(r => ({ ...r, group: 'http' })))
  if (o.browser && want('browser')) results.push(...(await browserChecks(o.site, o.out, o.prepare)).map(r => ({ ...r, group: 'browser' })))
  return results
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  o.out = resolve(o.out)
  await mkdir(o.out, { recursive: true })
  let server = null
  if (o.dist) {
    // Self-test against the mocked export (CI's Browser: flows job), so the browser
    // steps can't rot between incidents: no GitHub, no live, a guest on fixtures.
    const [{ serveDist }, { installSupabaseMock }, { loadRelationships }, { defaultNow }] = await Promise.all([
      import('./shots/lib/server.mjs'), import('./shots/lib/supabaseMock.mjs'), import('./shots/lib/schema.mjs'), import('./shots/fixtures/time.mjs'),
    ])
    server = await serveDist(resolve(o.dist))
    const relationships = loadRelationships(process.cwd())
    const now = defaultNow()
    o.site = server.url.replace(/\/+$/, '')
    o.deploy = false
    o.http = false
    o.prepare = page => installSupabaseMock(page, { now, signedIn: false, relationships })
  }
  let results = await runAll(o)
  const failedGroups = new Set(results.filter(r => !r.ok).map(r => r.group))
  if (failedGroups.size) {
    console.log(`Failed: ${results.filter(r => !r.ok).map(r => r.name).join(', ')}. Trying those again in ${o.retryWait} s.`)
    await new Promise(r => setTimeout(r, o.retryWait * 1000))
    const again = await runAll(o, failedGroups)
    results = results.filter(r => !failedGroups.has(r.group)).concat(again)
  }
  const summary = renderSummary(results, o.site)
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  for (const r of results.filter(x => !x.ok)) console.log(`::error title=${r.name}::${r.detail}`)
  await server?.close?.()
  process.exit(results.every(r => r.ok) ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
