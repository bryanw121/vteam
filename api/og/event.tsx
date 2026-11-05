import { ImageResponse } from '@vercel/og'
import { theme } from '../../constants/theme'
import { formatPrice } from '../../utils/price'
import { eventPreviewState, formatShareDate, formatShareTime, spotsLabel } from '../../utils/eventShare'
import type { EventPreviewRow, EventPreviewState } from '../../types'
import {
  EVENT_ID_RE,
  PREVIEW_CACHE_CONTROL,
  PREVIEW_ERROR_CACHE_CONTROL,
  fetchEventPreview,
  supabaseRestConfig,
} from '../_lib/eventPreview'

/**
 * `/api/og/event?id=<uuid>`: the 1200×630 link-preview card for an event (#130),
 * referenced by `og:image` from `api/event-page.ts`. Same anon read as the page.
 * No id, an unknown id or a failed read gives the generic vteam card.
 *
 * Drawn with satori (flexbox subset, inline styles only) from `theme` tokens and
 * Latin subsets of the app's fonts (`public/og-fonts`, SIL OFL).
 * Render it locally with `npm run og:render`.
 */
export const config = { runtime: 'edge' }

const WIDTH = 1200
const HEIGHT = 630
const PAD = 72

/** Card type sizes (px at 1200×630). The app's `theme.font` scale is for phone UI. */
const SIZE = { pill: 36, title: 84, titleLong: 64, meta: 32, badge: 36, wordmark: 44, hero: 132, tagline: 40 }
/** Titles longer than this drop to the smaller size so two lines still fit. */
const LONG_TITLE = 38
const MAX_TITLE = 90

/** Translucent ink on the gradient (satori needs literal colors; derived from `theme.colors.white`/`background`). */
const withAlpha = (hex: string, alpha: number) => hex + Math.round(alpha * 255).toString(16).padStart(2, '0')

/** Latin subsets of the app's fonts, served statically from `public/og-fonts` (TTF: satori can't read woff2). */
export const OG_FONT_FILES = {
  display: 'SpaceGrotesk_700Bold.ttf',
  body: 'Inter_500Medium.ttf',
  bodyBold: 'Inter_700Bold.ttf',
} as const

type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' }

/** Fonts from `bytes` (one ArrayBuffer per `OG_FONT_FILES` entry). */
export function ogFonts(bytes: Record<keyof typeof OG_FONT_FILES, ArrayBuffer>): OgFont[] {
  return [
    { name: 'Space Grotesk', data: bytes.display, weight: 700, style: 'normal' },
    { name: 'Inter', data: bytes.body, weight: 500, style: 'normal' },
    { name: 'Inter', data: bytes.bodyBold, weight: 700, style: 'normal' },
  ]
}

/**
 * Fetched from this deployment's static files rather than bundled, which keeps
 * the Edge bundle free of `import.meta` asset tricks. Cached per instance. If
 * they can't be fetched (e.g. a password-protected preview), the card still
 * renders in @vercel/og's built-in font.
 */
let fontCache: Promise<OgFont[] | undefined> | null = null
function loadFonts(origin: string): Promise<OgFont[] | undefined> {
  if (!fontCache) {
    const get = (file: string) => fetch(`${origin}/og-fonts/${file}`).then(r => {
      if (!r.ok) throw new Error(`og font ${file}: ${r.status}`)
      return r.arrayBuffer()
    })
    fontCache = Promise.all([get(OG_FONT_FILES.display), get(OG_FONT_FILES.body), get(OG_FONT_FILES.bodyBold)])
      .then(([display, body, bodyBold]) => ogFonts({ display, body, bodyBold }))
      .catch(err => {
        console.error('og/event: fonts unavailable, using the default font', err)
        fontCache = null
        return undefined
      })
  }
  return fontCache
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

function Background({ children }: { children: React.ReactNode }) {
  const [a, b, c] = theme.gradients.brand
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        padding: PAD,
        backgroundColor: theme.colors.primary,
        backgroundImage: `linear-gradient(135deg, ${a} 0%, ${b} 50%, ${c} 100%)`,
        color: theme.colors.white,
        fontFamily: 'Inter',
      }}
    >
      {children}
    </div>
  )
}

function Wordmark() {
  return (
    <div style={{ display: 'flex', fontFamily: 'Space Grotesk', fontSize: SIZE.wordmark, fontWeight: 700, letterSpacing: -1 }}>
      vteam
    </div>
  )
}

function Pill({ label, background, color, border }: { label: string; background: string; color: string; border?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 76,
        padding: '0 32px',
        borderRadius: theme.radius.full,
        backgroundColor: background,
        // satori throws on `border: undefined`, so only set it when there is one.
        ...(border ? { border: `3px solid ${border}` } : {}),
        color,
        fontSize: SIZE.pill,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  )
}

/** Bottom-right status: spots (green), full (amber), cancelled (red) or ended (muted). */
function StatusBadge({ state, label }: { state: EventPreviewState; label: string }) {
  const color = state === 'cancelled' ? theme.colors.error
    : state === 'ended' ? theme.colors.subtext
    : label.startsWith('Full') ? theme.colors.warning
    : theme.colors.success
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 92,
        padding: '0 36px',
        borderRadius: theme.radius.xl,
        backgroundColor: withAlpha(theme.colors.background, 0.92),
        color,
        fontSize: SIZE.badge,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  )
}

function EventCard({ event, attending, now }: { event: EventPreviewRow; attending: number; now: Date }) {
  const state = eventPreviewState(event, now)
  const title = truncate(event.title.trim() || 'Event', MAX_TITLE)
  const details = [event.location?.trim(), formatPrice(event.price)].filter(Boolean).join('  ·  ')
  const badge = state === 'cancelled' ? 'Cancelled' : state === 'ended' ? 'Ended' : spotsLabel(attending, event.max_attendees)
  const faded = state !== 'upcoming'

  return (
    <Background>
      <div style={{ display: 'flex', gap: 20, opacity: faded ? 0.7 : 1 }}>
        <Pill label={formatShareTime(event.event_date)} background={theme.colors.time} color={theme.colors.timeInk} border={theme.colors.timeBorder} />
        <Pill label={formatShareDate(event.event_date)} background={theme.colors.accent} color={theme.colors.accentInk} />
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 44,
          fontFamily: 'Space Grotesk',
          fontWeight: 700,
          fontSize: title.length > LONG_TITLE ? SIZE.titleLong : SIZE.title,
          lineHeight: 1.08,
          letterSpacing: -1.5,
          maxHeight: 2 * 1.08 * SIZE.title,
          overflow: 'hidden',
          textDecoration: state === 'cancelled' ? 'line-through' : 'none',
        }}
      >
        {title}
      </div>
      {details ? (
        <div style={{ display: 'flex', marginTop: 24, fontSize: SIZE.meta, color: withAlpha(theme.colors.white, 0.9) }}>
          {truncate(details, 64)}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark />
        <StatusBadge state={state} label={badge} />
      </div>
    </Background>
  )
}

function GenericCard() {
  return (
    <Background>
      <div style={{ display: 'flex', flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: SIZE.hero, letterSpacing: -4 }}>
          vteam
        </div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: SIZE.tagline, color: withAlpha(theme.colors.white, 0.92) }}>
          Find and join pickup volleyball near you.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <Pill label="Open play" background={theme.colors.time} color={theme.colors.timeInk} border={theme.colors.timeBorder} />
        <Pill label="Tournaments" background={theme.colors.accent} color={theme.colors.accentInk} />
      </div>
    </Background>
  )
}

/** Exported for the local render script and tests. */
export function renderCard(data: { event: EventPreviewRow; attending: number } | null, now: Date) {
  return data ? <EventCard event={data.event} attending={data.attending} now={now} /> : <GenericCard />
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  let data: { event: EventPreviewRow; attending: number } | null = null
  let cacheControl = PREVIEW_CACHE_CONTROL
  const cfg = supabaseRestConfig(process.env)
  if (EVENT_ID_RE.test(id) && cfg) {
    try {
      const res = await fetchEventPreview(id.toLowerCase(), cfg)
      if (res.event) data = { event: res.event, attending: res.attending }
    } catch (err) {
      console.error('og/event: could not read the event', err)
      cacheControl = PREVIEW_ERROR_CACHE_CONTROL
    }
  }
  return new ImageResponse(renderCard(data, new Date()), {
    width: WIDTH,
    height: HEIGHT,
    fonts: await loadFonts(url.origin),
    headers: { 'cache-control': cacheControl },
  })
}
