import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DEFAULT_WEB_ORIGIN } from '../constants/share'
import { GENERIC_PREVIEW } from '../utils/eventShare'
import { programPath, programPreviewMeta, sessionPreviewMeta, shareToday } from '../utils/outsideShare'
import { routes } from '../utils/routes'
import type { EventPreviewMeta } from '../types'
import { PREVIEW_CACHE_CONTROL, PREVIEW_ERROR_CACHE_CONTROL, requestOrigin, supabaseRestConfig } from './_lib/eventPreview'
import { fetchOutsideProgram, fetchOutsideSession, outsideId } from './_lib/outsidePreview'
import { injectHeadTags, loadIndexHtml, previewHeadTags } from './event-page'

/**
 * Links to games run outside vteam (#395): `/?session=<id>` and `/tournaments` or `/leagues`
 * (or `/`) with `?program=<id>`; vercel.json routes them here when the query has the id.
 * Serves the web app's `index.html` with preview tags for that session or program in the
 * <head>, like `api/event-page.ts` (whose helpers it uses); the <body> is untouched, and the
 * app opens the game's sheet from the address as usual. A row that is gone gets the generic card.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    res.status(405).end()
    return
  }

  let shell: string
  try {
    shell = await loadIndexHtml()
  } catch (err) {
    console.error('outside-page: index.html missing from the function bundle', err)
    res.status(500).end()
    return
  }

  const sessionId = outsideId(req.query.session)
  const programId = sessionId ? null : outsideId(req.query.program)
  const origin = requestOrigin(n => {
    const v = req.headers[n]
    return Array.isArray(v) ? v[0] : v
  }, DEFAULT_WEB_ORIGIN)

  let meta: EventPreviewMeta = GENERIC_PREVIEW
  let path = '/'
  let cacheControl = PREVIEW_CACHE_CONTROL
  const cfg = supabaseRestConfig(process.env)
  if ((sessionId || programId) && cfg) {
    try {
      const now = new Date()
      if (sessionId) {
        meta = sessionPreviewMeta(await fetchOutsideSession(sessionId, cfg), now)
        path = routes.events({ session: sessionId })
      } else if (programId) {
        const program = await fetchOutsideProgram(programId, cfg)
        meta = programPreviewMeta(program, shareToday(now))
        if (program) path = programPath(program)
      }
    } catch (err) {
      console.error('outside-page: could not read the row', err)
      cacheControl = PREVIEW_ERROR_CACHE_CONTROL
    }
  } else if (sessionId || programId) {
    console.error('outside-page: SUPABASE_URL / SUPABASE_ANON_KEY not set')
    cacheControl = PREVIEW_ERROR_CACHE_CONTROL
  }

  // The generic vteam card picture: outside games have no picture of their own yet.
  const html = injectHeadTags(shell, previewHeadTags(meta, `${origin}${path}`, `${origin}/api/og/event`))
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', cacheControl)
  res.status(200).send(req.method === 'HEAD' ? '' : html)
}
