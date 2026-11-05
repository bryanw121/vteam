/**
 * Render the event link-preview card (`api/og/event.tsx`, #130) to PNGs locally,
 * with made-up events and no network:
 *
 *   npm run og:render -- [outDir]   # default: shots/og (git-ignored)
 *
 * Writes upcoming / long-title / full / cancelled / ended / generic cards.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { ImageResponse } from '@vercel/og'
import { OG_FONT_FILES, ogFonts, renderCard } from '../api/og/event'
import type { EventPreviewRow } from '../types'

const ROOT = resolve(__dirname, '..')
const out = resolve(process.argv[2] ?? 'shots/og')
mkdirSync(out, { recursive: true })

const font = (file: string) => {
  const buf = readFileSync(join(ROOT, 'public/og-fonts', file))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
const fonts = ogFonts({
  display: font(OG_FONT_FILES.display),
  body: font(OG_FONT_FILES.body),
  bodyBold: font(OG_FONT_FILES.bodyBold),
})

const now = new Date('2026-10-30T19:15:00Z')
const base: EventPreviewRow = {
  id: '8f3c0000-0000-4000-8000-000000000001',
  title: 'Sand Doubles at Butler',
  event_date: '2026-10-31T21:00:00',
  location: 'Butler Park Sand Courts',
  max_attendees: 16,
  cancelled_at: null,
  price: null,
  duration_minutes: 120,
}

const cases: Record<string, { event: EventPreviewRow; attending: number } | null> = {
  upcoming: { event: base, attending: 12 },
  'long-title': { event: { ...base, title: 'Thursday Night Coed 6s: Intermediate+ Open Play & Drills', price: 8, location: 'Volleyworld, Pflugerville' }, attending: 3 },
  full: { event: base, attending: 16 },
  cancelled: { event: { ...base, cancelled_at: '2026-10-30T12:00:00Z' }, attending: 5 },
  ended: { event: { ...base, event_date: '2026-10-28T23:00:00' }, attending: 16 },
  generic: null,
}

async function main() {
  for (const [name, data] of Object.entries(cases)) {
    const res = new ImageResponse(renderCard(data, now), { width: 1200, height: 630, fonts })
    const file = join(out, `og-${name}.png`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    console.log(file)
  }
}

void main()
