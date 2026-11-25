#!/usr/bin/env node
// Sibling screens line up (lib/alignment.mjs): for each ALIGN_GROUPS group, on the mocked export
// (`--dist dist-mock`), at every ALIGN_SURFACES viewport and ALIGN_TEXT_SIZES text size, open each
// of its screens and measure the top of every anchor; the same anchor must sit at the same height on
// every screen of the group (switching tabs must not make a button jump). `--out <dir>` keeps a
// screenshot of each screen. Fails with one line per misaligned or missing anchor.
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchChromium, parseArgs } from './capture.mjs'
import { serveDist } from './lib/server.mjs'
import { installSupabaseMock } from './lib/supabaseMock.mjs'
import { loadRelationships, loadSeenIds } from './lib/schema.mjs'
import { defaultNow } from './fixtures/time.mjs'
import { ALIGN_GROUPS, ALIGN_SURFACES, ALIGN_TEXT_SIZES, misalignments } from './lib/alignment.mjs'

const TEXT_SIZE_KEY = 'vteam.textSize'

const args = parseArgs(process.argv.slice(2))
const out = args.out ? resolve(args.out) : null
if (out) await mkdir(out, { recursive: true })
const server = await serveDist(resolve(args.dist || 'dist'))
const problems = []
let browser
try {
  browser = await launchChromium()
  for (const group of ALIGN_GROUPS) {
    for (const surface of ALIGN_SURFACES.filter(s => !group.surfaces || group.surfaces.includes(s.name))) {
      for (const textSize of ALIGN_TEXT_SIZES) {
        const tops = {}
        for (const route of group.routes) {
          const context = await browser.newContext({ viewport: surface.viewport, timezoneId: 'America/Chicago', reducedMotion: 'reduce' })
          const now = defaultNow()
          await context.clock.install({ time: now })
          const page = await context.newPage()
          try {
            await installSupabaseMock(page, { now, signedIn: group.signedIn, seenIds: loadSeenIds(process.cwd()), relationships: loadRelationships(process.cwd()) })
            await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v) } catch {} }, [TEXT_SIZE_KEY, textSize])
            await page.goto(`${server.url}${route}`, { waitUntil: 'load' })
            await page.getByText('BETA', { exact: true }).waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
            tops[route] = {}
            for (const a of group.anchors) {
              const el = page.locator(a.selector).locator('visible=true').first()
              const box = await el.waitFor({ timeout: 15000 }).then(() => el.boundingBox(), () => null)
              tops[route][a.label] = box ? box.y : null
            }
            if (out) await page.screenshot({ path: `${out}/${group.name.replace(/\W+/g, '-')}-${surface.name.replace(/\W+/g, '-')}-${textSize}${route.replace(/\W+/g, '-')}.png` })
          } finally {
            await context.close()
          }
        }
        const found = misalignments({ group: group.name, surface: surface.name, textSize, tops })
        problems.push(...found)
        console.log(`${found.length ? 'FAIL' : 'ok'} ${group.name} (${surface.name}, ${textSize} text): ${JSON.stringify(tops)}`)
      }
    }
  }
} finally {
  await browser?.close()
  await server.close?.()
}
if (problems.length) {
  console.error(`\n${problems.length} alignment problem(s):\n${problems.map(p => `  - ${p}`).join('\n')}`)
  process.exit(1)
}
process.exit(0)
