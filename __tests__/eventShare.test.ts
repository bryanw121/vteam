import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildEventMeta, eventPreviewState, eventShareMessage, GENERIC_PREVIEW, spotsLabel } from '../utils/eventShare'
import { DEFAULT_WEB_ORIGIN, shareUrl, WEB_ORIGIN } from '../constants/share'
import { routes } from '../utils/routes'
import type { EventPreviewRow } from '../types'

// 4:00 PM Central on Sat Oct 31 2026 (the column is UTC without a zone suffix).
const EVENT: EventPreviewRow = {
  id: '8f3c0000-0000-4000-8000-000000000001',
  title: 'Sand Doubles',
  event_date: '2026-10-31T21:00:00',
  location: 'Butler Park',
  max_attendees: 16,
  cancelled_at: null,
  price: null,
  duration_minutes: 120,
}
const NOW = new Date('2026-10-30T19:15:00Z') // Fri 2:15 PM Central

describe('spotsLabel', () => {
  it('counts spots left against the cap', () => {
    expect(spotsLabel(12, 16)).toBe('4 of 16 spots left')
    expect(spotsLabel(0, 1)).toBe('1 of 1 spot left')
  })

  it('says full (and that the waitlist is open) at or over the cap', () => {
    expect(spotsLabel(16, 16)).toBe('Full · waitlist open')
    expect(spotsLabel(18, 16)).toBe('Full · waitlist open')
  })

  it('counts who is going when there is no cap', () => {
    expect(spotsLabel(6, null)).toBe('6 going')
    expect(spotsLabel(-2, 0)).toBe('0 going')
  })
})

describe('eventShareMessage', () => {
  it('writes the title and the Central time, whatever the device zone', () => {
    expect(eventShareMessage('Sand Doubles', EVENT.event_date)).toBe('"Sand Doubles" · Sat, Oct 31, 4:00 PM on vteam')
  })

  it('falls back when the title or date is missing', () => {
    expect(eventShareMessage(undefined, undefined)).toBe('"Event" on vteam')
    expect(eventShareMessage('  ', EVENT.event_date)).toMatch(/^"Event" · /)
  })

  it('reads a zoned timestamp the same way', () => {
    expect(eventShareMessage('X', '2026-10-31T21:00:00+00:00')).toBe('"X" · Sat, Oct 31, 4:00 PM on vteam')
  })
})

describe('buildEventMeta', () => {
  it('upcoming: title, time, place, spots with an as-of stamp, price', () => {
    const meta = buildEventMeta({ ...EVENT, price: 5 }, 12, NOW)
    expect(meta.state).toBe('upcoming')
    expect(meta.title).toBe('Sand Doubles')
    expect(meta.description).toBe('Sat, Oct 31, 4:00 PM CT · Butler Park · 4 of 16 spots left (as of Fri 2:15 PM) · $5')
    // The stamp is only in the description; the title and image alt stay stable.
    expect(meta.imageAlt).toBe('Sand Doubles: Sat, Oct 31 at 4:00 PM, 4 of 16 spots left')
    expect(meta.imageAlt).not.toMatch(/as of/)
  })

  it('full events say so', () => {
    expect(buildEventMeta(EVENT, 16, NOW).description).toContain('Full · waitlist open')
  })

  it('free events and events without a place', () => {
    const meta = buildEventMeta({ ...EVENT, location: null }, 0, NOW)
    expect(meta.description).toBe('Sat, Oct 31, 4:00 PM CT · 16 of 16 spots left (as of Fri 2:15 PM) · Free')
  })

  it('cancelled events say Cancelled and show no spots', () => {
    const meta = buildEventMeta({ ...EVENT, cancelled_at: '2026-10-30T12:00:00Z' }, 3, NOW)
    expect(meta.state).toBe('cancelled')
    expect(meta.title).toBe('Cancelled: Sand Doubles')
    expect(meta.description).toBe('Cancelled · was Sat, Oct 31, 4:00 PM CT · Butler Park')
    expect(meta.description).not.toMatch(/spots/)
  })

  it('ended events say Ended with the date', () => {
    const after = new Date('2026-10-31T23:30:00Z') // 30 min after the 2h event ended
    const meta = buildEventMeta(EVENT, 16, after)
    expect(meta.state).toBe('ended')
    expect(meta.title).toBe('Ended: Sand Doubles')
    expect(meta.description).toBe('Ended · Sat, Oct 31 · Butler Park')
  })

  it('is still upcoming while it is being played', () => {
    expect(eventPreviewState(EVENT, new Date('2026-10-31T22:59:00Z'))).toBe('upcoming')
    expect(eventPreviewState({ ...EVENT, duration_minutes: undefined }, new Date('2026-10-31T23:01:00Z'))).toBe('ended')
  })

  it('missing events get the generic card', () => {
    expect(buildEventMeta(null, 0, NOW)).toBe(GENERIC_PREVIEW)
  })

  it('returns plain text (escaping is the HTML writer\'s job)', () => {
    const meta = buildEventMeta({ ...EVENT, title: '"><script>x</script>' }, 0, NOW)
    expect(meta.title).toBe('"><script>x</script>')
  })
})

describe('shareUrl', () => {
  it('is an https link on the production origin by default', () => {
    expect(DEFAULT_WEB_ORIGIN).toBe('https://vteamvolleyball.com')
    expect(WEB_ORIGIN).toBe(DEFAULT_WEB_ORIGIN)
    expect(shareUrl(routes.event('abc'))).toBe('https://vteamvolleyball.com/event/abc')
  })

  it('on web, uses the origin the app is served from', () => {
    const g = globalThis as { window?: unknown }
    const before = g.window
    g.window = { location: { protocol: 'https:', origin: 'https://preview-123.vercel.app' } }
    try {
      expect(shareUrl('/event/abc')).toBe('https://preview-123.vercel.app/event/abc')
    } finally {
      g.window = before
    }
  })

  it('ignores non-http origins (native file:// or app schemes)', () => {
    const g = globalThis as { window?: unknown }
    const before = g.window
    g.window = { location: { protocol: 'file:', origin: 'null' } }
    try {
      expect(shareUrl('/event/abc')).toBe('https://vteamvolleyball.com/event/abc')
    } finally {
      g.window = before
    }
  })
})

describe('server-shared modules stay dependency-free', () => {
  // api/ functions import these; a react-native or supabase import would break the Edge bundle.
  it.each(['constants/share.ts', 'constants/theme.ts', 'constants/selects.ts', 'utils/eventDate.ts', 'utils/price.ts', 'utils/eventShare.ts', 'api/_lib/eventPreview.ts'])('%s', file => {
    const src = readFileSync(resolve(__dirname, '..', file), 'utf8')
    const imports = [...src.matchAll(/^import\s+(type\s+)?[^'"]*['"]([^'"]+)['"]/gm)]
    for (const [, isType, spec] of imports) {
      if (isType) continue
      expect([spec, file]).toEqual([expect.stringMatching(/^\.\.?\/(\.\.\/)?(constants\/(share|selects)|utils\/(eventDate|price))$|^\.\/(eventDate|price)$/), file])
    }
  })
})
