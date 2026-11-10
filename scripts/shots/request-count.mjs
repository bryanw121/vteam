#!/usr/bin/env node
/**
 * Counts the Supabase reads a first visit to each page sends, in the real web
 * export with every Supabase call mocked (no secrets, no network). Signed in,
 * phone width, nothing saved on the device, 6 s after load.
 *
 *   node scripts/shots/request-count.mjs --dist dist-mock [--paths /profile,/] [--list] [--delay 1000 --pool 10]
 *
 * Prints `<path> <count>` per page (and every request with --list). With
 * --delay, every Supabase response is held that long and at most --pool are
 * served at once (PostgREST's pool on a Micro instance), and the line adds when
 * the last read finished. #224 holds Profile to 16 reads (3.0 s at 1000 / 10)
 * and Events to 14.
 */
import { resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'

const args = parseArgs(process.argv.slice(2))
const paths = String(args.paths || '/profile,/').split(',')
const settleMs = Number(args.settle ?? 6000)
const delay = Number(args.delay ?? 0)
const pool = Number(args.pool ?? 10)
const server = await serveDist(resolve(args.dist || 'dist'))
let browser
const results = {}
const finished = {}

/** `GET rest/v1/profiles?select=avatar_url` → `GET profiles select=avatar_url` (enough to tell reads apart). */
function describe(request) {
  const url = new URL(request.url())
  const path = url.pathname.replace(/^\/(rest|auth|storage|functions)\/v1\//, '')
  const select = url.searchParams.get('select')
  return `${request.method()} ${path}${select ? ` select=${select.slice(0, 60)}` : ''}`
}

try {
  browser = await launchChromium()
  for (const path of paths) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago', locale: 'en-US' })
    const page = await context.newPage()
    await installSupabaseMock(page, { now: defaultNow(), signedIn: true, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
    const seen = []
    if (delay > 0) {
      let busy = 0
      const waiting = []
      const acquire = () => (busy < pool ? (busy++, Promise.resolve()) : new Promise(r => waiting.push(r)))
      const release = () => { const next = waiting.shift(); if (next) next(); else busy-- }
      // Registered after the mock, so it runs first and then hands the request on to it.
      await page.route(url => url.href.includes('.supabase.co/') && !url.href.includes('/realtime/'), async route => {
        if (route.request().method() === 'OPTIONS') return route.fallback()
        await acquire()
        await new Promise(r => setTimeout(r, delay))
        release()
        await route.fallback()
      })
    }
    let start = 0
    let last = 0
    page.on('requestfinished', request => {
      const href = request.url()
      if (href.includes('.supabase.co/') && !href.includes('/realtime/') && !href.includes('/rest/v1/app_events')) last = Date.now()
    })
    page.on('request', request => {
      const href = request.url()
      if (!href.includes('.supabase.co/') || href.includes('/realtime/') || request.method() === 'OPTIONS') return
      // Usage metrics are writes batched every 10 s, not reads a screen waits on.
      if (href.includes('/rest/v1/app_events')) return
      if (!['GET', 'HEAD'].includes(request.method()) && !href.includes('/rpc/')) return
      seen.push(describe(request))
    })
    start = Date.now()
    await page.goto(`${server.url}${path}`, { waitUntil: 'load' })
    await page.waitForTimeout(settleMs + delay * 4)
    results[path] = seen
    finished[path] = last ? last - start : null
    await context.close()
  }
} finally {
  await browser?.close()
  await server.close()
}

for (const [path, seen] of Object.entries(results)) {
  const timing = delay > 0 && finished[path] != null ? ` (last read done at ${(finished[path] / 1000).toFixed(2)} s)` : ''
  console.log(`${path} ${seen.length}${timing}`)
  if (args.list) for (const line of seen.sort()) console.log(`  ${line}`)
}
