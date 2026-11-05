import { readFile } from 'fs/promises'
import { join } from 'path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DEFAULT_WEB_ORIGIN } from '../constants/share'
import { buildEventMeta, GENERIC_PREVIEW } from '../utils/eventShare'
import type { EventPreviewMeta } from '../types'
import {
  EVENT_ID_RE,
  PREVIEW_CACHE_CONTROL,
  PREVIEW_ERROR_CACHE_CONTROL,
  fetchEventPreview,
  requestOrigin,
  shortHash,
  supabaseRestConfig,
} from './_lib/eventPreview'

/**
 * `/event/<uuid>` (vercel.json routes it here, #130). Serves the web app's
 * `index.html` with link-preview tags in its <head> (title, og:*, twitter:*)
 * so iMessage, WhatsApp, Slack and friends show a card for a shared event.
 *
 * Everyone gets the same HTML (no user-agent sniffing): people get the normal
 * SPA, which hydrates `#root` in the <body>. Only the <head> changes, so this
 * can't cause a hydration mismatch.
 *
 * The event is read with the anon key, so the tags carry nothing a guest can't
 * already see on the page. Every value is HTML-escaped.
 */

/** Bundled via `functions["api/event-page.ts"].includeFiles` in vercel.json. */
const INDEX_HTML_PATH = join(process.cwd(), 'dist', 'index.html')

let indexHtml: Promise<string> | null = null

/** The exported shell, read once per instance. Exported for tests. */
export function loadIndexHtml(read: (path: string) => Promise<string> = p => readFile(p, 'utf8')): Promise<string> {
  if (!indexHtml) {
    indexHtml = read(INDEX_HTML_PATH).catch(err => {
      indexHtml = null
      throw err
    })
  }
  return indexHtml
}

/** Test hook: forget the cached shell. */
export function resetIndexHtmlCache() {
  indexHtml = null
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])
}

/** The <head> tags for a preview. All values escaped. */
export function previewHeadTags(meta: EventPreviewMeta, pageUrl: string, imageUrl: string): string {
  const e = escapeHtml
  const prop = (p: string, v: string) => `<meta property="${p}" content="${e(v)}"/>`
  const name = (n: string, v: string) => `<meta name="${n}" content="${e(v)}"/>`
  return [
    `<title>${e(meta.title)}</title>`,
    name('description', meta.description),
    prop('og:site_name', 'vteam'),
    prop('og:type', 'website'),
    prop('og:title', meta.title),
    prop('og:description', meta.description),
    prop('og:url', pageUrl),
    prop('og:image', imageUrl),
    prop('og:image:type', 'image/png'),
    prop('og:image:width', '1200'),
    prop('og:image:height', '630'),
    prop('og:image:alt', meta.imageAlt),
    name('twitter:card', 'summary_large_image'),
    name('twitter:title', meta.title),
    name('twitter:description', meta.description),
    name('twitter:image', imageUrl),
    name('twitter:image:alt', meta.imageAlt),
  ].join('')
}

/**
 * Put `tags` into the shell's <head>: replaces the export's (empty) <title> and
 * goes right after `<meta charset>` so crawlers that read only the first bytes
 * find them. The <body> is returned byte for byte.
 */
export function injectHeadTags(html: string, tags: string): string {
  const headEnd = html.search(/<\/head>/i)
  if (headEnd === -1) return html
  let head = html.slice(0, headEnd).replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, '')
  const rest = html.slice(headEnd)
  const charset = head.match(/<meta\s+charset=[^>]*>/i)
  if (charset && charset.index !== undefined) {
    const at = charset.index + charset[0].length
    head = head.slice(0, at) + tags + head.slice(at)
  } else {
    head += tags
  }
  return head + rest
}

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
    console.error('event-page: index.html missing from the function bundle', err)
    res.status(500).end()
    return
  }

  const rawId = typeof req.query.id === 'string' ? req.query.id : ''
  const id = EVENT_ID_RE.test(rawId) ? rawId.toLowerCase() : null
  const origin = requestOrigin(n => {
    const v = req.headers[n]
    return Array.isArray(v) ? v[0] : v
  }, DEFAULT_WEB_ORIGIN)

  let meta = GENERIC_PREVIEW
  let cacheControl = PREVIEW_CACHE_CONTROL
  const cfg = supabaseRestConfig(process.env)
  if (id && cfg) {
    try {
      const { event, attending } = await fetchEventPreview(id, cfg)
      meta = buildEventMeta(event, attending, new Date())
    } catch (err) {
      console.error('event-page: could not read the event', err)
      cacheControl = PREVIEW_ERROR_CACHE_CONTROL
    }
  } else if (id) {
    console.error('event-page: SUPABASE_URL / SUPABASE_ANON_KEY not set')
    cacheControl = PREVIEW_ERROR_CACHE_CONTROL
  }

  const pageUrl = id ? `${origin}/event/${id}` : origin
  // `v` changes when what the card shows changes, so apps don't keep an old image.
  const imageUrl = meta.state === 'missing' || !id
    ? `${origin}/api/og/event`
    : `${origin}/api/og/event?id=${id}&v=${shortHash(meta.imageAlt + meta.state)}`

  const html = injectHeadTags(shell, previewHeadTags(meta, pageUrl, imageUrl))
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', cacheControl)
  res.status(200).send(req.method === 'HEAD' ? '' : html)
}
