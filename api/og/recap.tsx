import { ImageResponse } from '@vercel/og'
import { theme } from '../../constants/theme'
import { EVENT_ID_RE, PREVIEW_ERROR_CACHE_CONTROL, supabaseRestConfig } from '../_lib/eventPreview'
import { fetchRecap } from '../_lib/recap'
import { OG_FONT_FILES, ogFonts } from './event'
import type { RecapMeta } from '../../utils/recap'

/**
 * `/api/og/recap?event=<uuid>&user=<uuid>`: a story-sized (1080×1920) picture of
 * one player's finished game (#227), shared from the event page. Only the
 * player's own name and numbers. 404 unless that player was attending the game
 * (not a no-show) and it has ended. Same anon reads as the link preview.
 */
export const config = { runtime: 'edge' }

const WIDTH = 1080
const HEIGHT = 1920
const PAD = 96
/** Story type sizes (px at 1080×1920). */
const SIZE = { kicker: 44, title: 104, meta: 44, statValue: 120, statLabel: 38, wordmark: 64, cta: 44 }
export const RECAP_CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400'

const withAlpha = (hex: string, alpha: number) => hex + Math.round(alpha * 255).toString(16).padStart(2, '0')

let fontCache: ReturnType<typeof ogFonts> | null = null
async function loadFonts(origin: string) {
  if (fontCache) return fontCache
  try {
    const get = async (file: string) => {
      const r = await fetch(`${origin}/og-fonts/${file}`)
      if (!r.ok) throw new Error(`og font ${file}: ${r.status}`)
      return r.arrayBuffer()
    }
    const [display, body, bodyBold] = await Promise.all([get(OG_FONT_FILES.display), get(OG_FONT_FILES.body), get(OG_FONT_FILES.bodyBold)])
    fontCache = ogFonts({ display, body, bodyBold })
    return fontCache
  } catch (err) {
    console.error('og/recap: fonts unavailable, using the default font', err)
    return undefined
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
      <div style={{ display: 'flex', fontFamily: 'Space Grotesk', fontSize: SIZE.statValue, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', marginTop: 12, fontSize: SIZE.statLabel, color: withAlpha(theme.colors.white, 0.8) }}>{label}</div>
    </div>
  )
}

export function renderRecap(meta: RecapMeta) {
  const [a, b, c] = theme.gradients.brand
  return (
    <div
      style={{
        width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: PAD, backgroundColor: theme.colors.primary,
        backgroundImage: `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 100%)`,
        color: theme.colors.white, fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', fontFamily: 'Space Grotesk', fontSize: SIZE.wordmark, fontWeight: 700, letterSpacing: -1 }}>vteam</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: SIZE.kicker, fontWeight: 700, color: withAlpha(theme.colors.white, 0.85) }}>
          {`${meta.name} played`}
        </div>
        <div style={{ display: 'flex', marginTop: 24, fontFamily: 'Space Grotesk', fontSize: SIZE.title, fontWeight: 700, lineHeight: 1.05 }}>
          {meta.title}
        </div>
        <div style={{ display: 'flex', marginTop: 32, fontSize: SIZE.meta, color: withAlpha(theme.colors.white, 0.85) }}>
          {meta.place ? `${meta.date} · ${meta.place}` : meta.date}
        </div>
        <div style={{ display: 'flex', marginTop: 96, gap: 32 }}>
          <Stat value={`+${meta.points}`} label="points" />
          <Stat value={String(meta.cheers)} label={meta.cheers === 1 ? 'cheer' : 'cheers'} />
          <Stat value={String(meta.gamesThisYear)} label={meta.gamesThisYear === 1 ? 'game this year' : 'games this year'} />
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: SIZE.cta, fontWeight: 700 }}>Find your next game on vteam</div>
    </div>
  )
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const eventId = (url.searchParams.get('event') ?? '').toLowerCase()
  const userId = (url.searchParams.get('user') ?? '').toLowerCase()
  const cfg = supabaseRestConfig(process.env)
  if (!EVENT_ID_RE.test(eventId) || !EVENT_ID_RE.test(userId) || !cfg) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': PREVIEW_ERROR_CACHE_CONTROL } })
  }
  let meta: RecapMeta | null
  try {
    meta = await fetchRecap(eventId, userId, cfg, Date.now())
  } catch (err) {
    console.error('og/recap: could not read the recap', err)
    return new Response('Unavailable', { status: 503, headers: { 'cache-control': PREVIEW_ERROR_CACHE_CONTROL } })
  }
  if (!meta) return new Response('Not found', { status: 404, headers: { 'cache-control': PREVIEW_ERROR_CACHE_CONTROL } })
  return new ImageResponse(renderRecap(meta), {
    width: WIDTH,
    height: HEIGHT,
    fonts: await loadFonts(url.origin),
    headers: { 'cache-control': RECAP_CACHE_CONTROL },
  })
}
