#!/usr/bin/env node
/**
 * Before/after screenshots of the web app between two git refs.
 *
 *   node scripts/shots/compare.mjs --before <ref> --after <ref> --out <dir>
 *        [--screens a,b | --files <changed files, comma or space separated>]
 *        [--desktop] [--keep] [--now ISO] [--tolerance 8]
 *
 * For each ref: a temporary `git worktree`, node_modules reused when its
 * package-lock.json matches one already installed (this checkout's, or the
 * other ref's) and `npm ci` otherwise, then `expo export -p web` against the
 * mock Supabase URL. Both exports are captured with the same frozen fixtures
 * (capture.mjs). Writes, for every screen whose two images differ:
 *
 *   <out>/<screen>-before.png, <screen>-after.png, <screen>-compare.png
 *
 * Identical pairs are deleted ("identical": no channel of any pixel differs by
 * more than --tolerance, default 8 of 255, which absorbs rasterization noise;
 * --tolerance 0 is exact). Also writes <out>/summary.json (printed to
 * stdout) and <out>/index.html (every comparison on one page).
 *
 * Screens: --screens as given; else --files mapped through affected.mjs; else
 * the files changed between the two refs (`git diff --name-only`).
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { capture, launchChromium, parseArgs } from './capture.mjs'
import { affectedScreens } from './affected.mjs'
import { SCREENS } from './screens.mjs'
import { MOCK_SUPABASE_URL, MOCK_ANON_KEY } from './lib/supabaseMock.mjs'
import { defaultNow } from './fixtures/time.mjs'

/**
 * Per-channel difference (0-255) still counted as "the same pixel". Chromium's
 * software rasterizer varies gradients and blurred shadows by 1-3 levels from
 * run to run; a real change moves pixels far more than this.
 */
const DEFAULT_TOLERANCE = 8

const log = msg => process.stderr.write(`[shots] ${msg}\n`)

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function run(cmd, args, opts) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const keep = d => { tail = (tail + d.toString()).slice(-4000) }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    child.on('error', rej)
    child.on('close', code => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${tail}`))))
  })
}

const sha = file => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'none')

/** A worktree for `ref` with node_modules and a web export built against the mock. */
async function prepare(repo, ref, label, work, installs) {
  const dir = join(work, label)
  log(`${label}: worktree at ${ref.slice(0, 10)}`)
  git(repo, 'worktree', 'add', '--detach', '--force', dir, ref)
  const lock = sha(join(dir, 'package-lock.json'))
  if (installs.has(lock)) {
    symlinkSync(installs.get(lock), join(dir, 'node_modules'), 'dir')
    log(`${label}: reusing node_modules (same package-lock.json)`)
  } else {
    log(`${label}: npm ci (package-lock.json differs)`)
    const t = Date.now()
    await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, env: process.env })
    installs.set(lock, join(dir, 'node_modules'))
    log(`${label}: npm ci done in ${Math.round((Date.now() - t) / 1000)}s`)
  }
  const tmp = join(work, `tmp-${label}`)
  mkdirSync(tmp, { recursive: true })
  const t = Date.now()
  log(`${label}: expo export -p web`)
  await run('npx', ['expo', 'export', '-p', 'web', '--clear', '--output-dir', 'dist'], {
    cwd: dir,
    env: {
      ...process.env,
      TMPDIR: tmp, // Metro's cache lives under TMPDIR: keep each export's to itself
      CI: '1',
      EXPO_NO_TELEMETRY: '1',
      EXPO_PUBLIC_SUPABASE_URL: MOCK_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: MOCK_ANON_KEY,
      EXPO_PUBLIC_SENTRY_DSN: '',
      EXPO_PUBLIC_APP_ENV: 'development',
    },
  })
  log(`${label}: exported in ${Math.round((Date.now() - t) / 1000)}s`)
  return { dir, dist: join(dir, 'dist'), exportSeconds: Math.round((Date.now() - t) / 1000) }
}

/**
 * Compare each before/after pair in the browser (canvas pixels), and render the
 * changed ones side by side. Returns `{ [file]: differingPixels }`.
 */
async function diffAndRender(pairs, tolerance) {
  const browser = await launchChromium()
  const results = []
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 })
    for (const p of pairs) {
      const a = `data:image/png;base64,${readFileSync(p.before).toString('base64')}`
      const b = `data:image/png;base64,${readFileSync(p.after).toString('base64')}`
      const diff = await page.evaluate(async ([a, b, tol]) => {
        const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
        const [ia, ib] = await Promise.all([load(a), load(b)])
        const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height)
        const px = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data }
        const da = px(ia), db = px(ib)
        let n = 0
        for (let i = 0; i < da.length; i += 4) {
          if (Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol || Math.abs(da[i + 2] - db[i + 2]) > tol || Math.abs(da[i + 3] - db[i + 3]) > tol) n++
        }
        return { pixels: n, total: w * h, width: ia.width, height: ia.height, sizeChanged: ia.width !== ib.width || ia.height !== ib.height }
      }, [a, b, tolerance])
      results.push({ ...p, ...diff })
      if (diff.pixels === 0) continue
      const display = Math.round(diff.width / 2) // mobile shots are @2x; desktop ones are shown at half size
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        body{margin:0;background:#f3f1fa;font:600 15px -apple-system,Segoe UI,Roboto,sans-serif;color:#1d1b2e}
        .wrap{display:inline-flex;flex-direction:column;gap:12px;padding:20px}
        h1{margin:0;font-size:17px}.sub{font-weight:500;color:#5d5a72;font-size:13px}
        .row{display:flex;gap:20px}.col{display:flex;flex-direction:column;gap:8px}
        .tag{align-self:flex-start;padding:3px 10px;border-radius:999px;font-size:13px;letter-spacing:.04em;text-transform:uppercase}
        .before{background:#e4e1ee;color:#4a4760}.after{background:#6c47ff;color:#fff}
        img{width:${display}px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.18)}
      </style></head><body><div class="wrap">
        <div><h1>${p.screen}${p.size === 'desktop' ? ' (desktop)' : ''}</h1><div class="sub">${p.route} · ${(100 * diff.pixels / diff.total).toFixed(1)}% of pixels changed</div></div>
        <div class="row"><div class="col"><span class="tag before">Before</span><img src="${a}"></div>
        <div class="col"><span class="tag after">After</span><img src="${b}"></div></div>
      </div></body></html>`
      await page.setContent(html)
      await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())))
      await page.locator('.wrap').screenshot({ path: p.compare })
    }
  } finally {
    await browser.close()
  }
  return results
}

function writeIndex(out, summary) {
  const card = c => `<figure><figcaption>${c.screen}${c.size === 'desktop' ? ' (desktop)' : ''} <small>${(c.diffRatio * 100).toFixed(1)}%</small></figcaption><img src="${basename(c.compare)}" loading="lazy"></figure>`
  writeFileSync(join(out, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>vteam screens ${summary.before.ref} → ${summary.after.ref}</title>
<style>body{font:15px -apple-system,Segoe UI,Roboto,sans-serif;margin:24px;background:#f3f1fa;color:#1d1b2e}figure{margin:0 0 28px}img{max-width:100%;height:auto}small{color:#5d5a72}code{background:#e4e1ee;padding:1px 5px;border-radius:4px}</style></head><body>
<h1>Screens changed: ${summary.changed.length}</h1>
<p><code>${summary.before.ref}</code> (${summary.before.sha.slice(0, 7)}) → <code>${summary.after.ref}</code> (${summary.after.sha.slice(0, 7)}). Unchanged: ${summary.unchanged.map(u => u.screen).join(', ') || 'none'}.${summary.problems.length ? ` Problems: ${summary.problems.map(p => `${p.screen} (${p.side}: ${p.issue})`).join('; ')}.` : ''}</p>
${summary.changed.map(card).join('\n')}</body></html>`)
}

export async function compare(o) {
  const t0 = Date.now()
  const repo = git(process.cwd(), 'rev-parse', '--show-toplevel')
  const out = resolve(o.out)
  mkdirSync(out, { recursive: true })
  const beforeSha = git(repo, 'rev-parse', `${o.before}^{commit}`)
  const afterSha = git(repo, 'rev-parse', `${o.after}^{commit}`)

  let screens
  if (o.screens?.length) screens = o.screens
  else {
    const files = o.files?.length ? o.files : git(repo, 'diff', '--name-only', beforeSha, afterSha).split('\n').filter(Boolean)
    screens = affectedScreens(files)
    log(`${files.length} changed file(s) → ${screens.length} screen(s)`)
  }
  const unknown = screens.filter(s => !SCREENS[s])
  if (unknown.length) throw new Error(`Unknown screen(s): ${unknown.join(', ')}`)
  const summary = {
    before: { ref: o.before, sha: beforeSha }, after: { ref: o.after, sha: afterSha }, out,
    screens, changed: [], unchanged: [], problems: [], seconds: {},
  }
  if (screens.length === 0) {
    log('no screens affected')
    writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2))
    return summary
  }

  const work = mkdtempSync(join(o.workDir ?? tmpdir(), 'vteam-shots-'))
  const installs = new Map()
  const ownModules = join(repo, 'node_modules')
  // Link to the real directory: Metro does not follow a symlink to a symlink.
  if (existsSync(ownModules)) installs.set(sha(join(repo, 'package-lock.json')), realpathSync(ownModules))
  const now = o.now ?? defaultNow()
  try {
    const sides = {}
    for (const [label, ref] of [['before', beforeSha], ['after', afterSha]]) {
      const t = Date.now()
      const prepared = await prepare(repo, ref, label, work, installs)
      summary.seconds[`${label}Export`] = prepared.exportSeconds
      const tc = Date.now()
      log(`${label}: capturing ${screens.length} screen(s)`)
      const results = await capture({ dist: prepared.dist, out, screens, desktop: o.desktop, src: prepared.dir, now, suffix: `-${label}` })
      summary.seconds[`${label}Capture`] = Math.round((Date.now() - tc) / 1000)
      summary.seconds[label] = Math.round((Date.now() - t) / 1000)
      sides[label] = results
      for (const r of results) {
        if (r.errors.length) summary.problems.push({ screen: r.screen, size: r.size, side: label, issue: r.errors.join(' | ') })
        else if (r.ready === false) summary.problems.push({ screen: r.screen, size: r.size, side: label, issue: `ready text "${SCREENS[r.screen].ready}" not found` })
        if (r.misses.length) summary.problems.push({ screen: r.screen, size: r.size, side: label, issue: `unmocked: ${r.misses.join(', ')}` })
      }
    }
    const pairs = sides.after.filter(a => a.file).flatMap(a => {
      const b = sides.before.find(x => x.screen === a.screen && x.size === a.size && x.file)
      if (!b) return []
      const stem = `${a.screen}${a.size === 'desktop' ? '-desktop' : ''}`
      return [{ screen: a.screen, size: a.size, route: SCREENS[a.screen].route, before: b.file, after: a.file, compare: join(out, `${stem}-compare.png`) }]
    })
    const tc = Date.now()
    for (const d of await diffAndRender(pairs, o.tolerance ?? DEFAULT_TOLERANCE)) {
      if (d.pixels === 0) {
        rmSync(d.before, { force: true })
        rmSync(d.after, { force: true })
        summary.unchanged.push({ screen: d.screen, size: d.size })
      } else {
        summary.changed.push({ screen: d.screen, size: d.size, route: d.route, before: d.before, after: d.after, compare: d.compare, diffPixels: d.pixels, diffRatio: Number((d.pixels / d.total).toFixed(4)), sizeChanged: d.sizeChanged })
      }
    }
    summary.seconds.compare = Math.round((Date.now() - tc) / 1000)
  } finally {
    if (!o.keep) {
      for (const label of ['before', 'after']) {
        try { git(repo, 'worktree', 'remove', '--force', join(work, label)) } catch { /* not created */ }
      }
      rmSync(work, { recursive: true, force: true })
      try { git(repo, 'worktree', 'prune') } catch { /* ignore */ }
    } else log(`kept worktrees in ${work}`)
  }
  summary.seconds.total = Math.round((Date.now() - t0) / 1000)
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2))
  writeIndex(out, summary)
  return summary
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || typeof args.before !== 'string' || typeof args.after !== 'string') {
    console.error('usage: node scripts/shots/compare.mjs --before <ref> --after <ref> --out <dir> [--screens a,b | --files f1,f2] [--desktop] [--keep] [--now ISO] [--tolerance 8]')
    process.exit(args.help ? 0 : 2)
  }
  const list = v => (typeof v === 'string' ? v.split(/[\s,]+/).filter(Boolean) : undefined)
  const summary = await compare({
    before: args.before,
    after: args.after,
    out: typeof args.out === 'string' ? args.out : 'shots',
    screens: list(args.screens),
    files: [...(list(args.files) ?? []), ...(args._ ?? [])],
    desktop: !!args.desktop,
    keep: !!args.keep,
    now: typeof args.now === 'string' ? new Date(args.now) : undefined,
    tolerance: typeof args.tolerance === 'string' ? Number(args.tolerance) : undefined,
  })
  console.log(JSON.stringify(summary, null, 2))
}
