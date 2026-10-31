/**
 * Edge Function: generate-badge-art
 *
 * Admin-only (#10). Generates the art for one badge tier with OpenAI's Images
 * API, stores the PNG in the public `badges` bucket and records its URL in
 * public.badge_art, which the app reads (hooks/useBadgeArt). Nothing calls
 * this on the render path: the app shows the stored URL, or the built-in art
 * when there is none.
 *
 * The prompt comes from the tier spec and the shared style tokens in
 * _shared/badgeArt.ts, so every tier looks like part of one set.
 *
 * Request (POST, JSON):
 *   { badge, title, description, tier, tierName, maxTier, accent, palette: [top, bottom], dryRun? }
 * scripts/generate-badge-art.mjs builds this from constants/badges.ts.
 *
 * Responses:
 *   200 { url, path, prompt, model }    generated, stored and recorded
 *   200 { prompt, model, dryRun: true } dryRun: prompt only, nothing called or written
 *   400 invalid body       401 no / bad user JWT       403 not an admin
 *   503 { error: 'not configured' }     OPENAI_API_KEY is not set
 *   502 the image API failed or returned no PNG
 *   500 storage or database error
 *
 * Secrets:
 *   OPENAI_API_KEY        required to generate (without it: 503)
 *   OPENAI_IMAGE_MODEL    optional, default DEFAULT_IMAGE_MODEL
 *   OPENAI_IMAGE_QUALITY  optional low | medium | high, default medium
 *   ALLOWED_ORIGINS       optional CORS allow-list, as for places-proxy
 *
 * Deployed with verify_jwt = true (supabase/config.toml); the function also
 * resolves the caller from the JWT and checks admin itself.
 */

import { getServiceClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'
import {
  BADGE_BUCKET,
  MAX_IMAGE_BYTES,
  OPENAI_IMAGES_URL,
  badgeArtPath,
  badgeArtPrompt,
  decodeImage,
  imageModel,
  isAdmin,
  isPng,
  openAiImageBody,
  parseBadgeArtRequest,
  type ImageEnv,
} from '../_shared/badgeArt.ts'

/** Generation takes 20-60s; give up well inside the function's wall-clock limit. */
const IMAGE_TIMEOUT_MS = 120_000

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  let parsed: ReturnType<typeof parseBadgeArtRequest>
  try {
    parsed = parseBadgeArtRequest(await req.json())
  } catch {
    return json(400, { error: 'invalid JSON' })
  }
  if ('error' in parsed) return json(400, { error: parsed.error })
  const spec = parsed.spec

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { error: 'sign in required' })

  try {
    const db = getServiceClient()
    const { data: auth, error: authError } = await db.auth.getUser(jwt)
    const caller = auth?.user
    if (authError || !caller) return json(401, { error: 'sign in required' })

    const admin = await isAdmin(
      () => db.from('app_admins').select('user_id').eq('user_id', caller.id).limit(1),
      () => db.from('profiles').select('is_admin').eq('id', caller.id).maybeSingle(),
    )
    if (!admin) return json(403, { error: 'admins only' })

    const env: ImageEnv = {
      apiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined,
      model: Deno.env.get('OPENAI_IMAGE_MODEL') ?? undefined,
      quality: Deno.env.get('OPENAI_IMAGE_QUALITY') ?? undefined,
    }
    const prompt = badgeArtPrompt(spec)
    const model = imageModel(env)
    if (spec.dryRun) return json(200, { prompt, model, dryRun: true })
    if (!env.apiKey) {
      console.warn('[generate-badge-art] OPENAI_API_KEY is not set')
      return json(503, { error: 'not configured' })
    }

    const res = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(openAiImageBody(prompt, env)),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`
      console.error('[generate-badge-art] image API rejected', res.status, message)
      return json(502, { error: `image API error: ${message}` })
    }
    const bytes = decodeImage(body)
    if (!bytes || !isPng(bytes) || bytes.length > MAX_IMAGE_BYTES) {
      return json(502, { error: 'image API returned no usable PNG' })
    }

    const now = Date.now()
    const path = badgeArtPath(spec.badge, spec.tier, now)
    const upload = await db.storage.from(BADGE_BUCKET).upload(path, bytes, {
      contentType: 'image/png',
      // Each generation is a new file, so it can be cached for good.
      cacheControl: '31536000',
      upsert: false,
    })
    if (upload.error) throw upload.error
    const url = db.storage.from(BADGE_BUCKET).getPublicUrl(path).data.publicUrl

    const { error: rowError } = await db.from('badge_art').upsert(
      {
        badge_type: spec.badge,
        tier: spec.tier,
        image_url: url,
        prompt,
        model,
        generated_by: caller.id,
        generated_at: new Date(now).toISOString(),
      },
      { onConflict: 'badge_type,tier' },
    )
    if (rowError) throw rowError

    return json(200, { url, path, prompt, model })
  } catch (err) {
    console.error('[generate-badge-art]', err)
    if (err instanceof DOMException && err.name === 'TimeoutError') return json(502, { error: 'image API timed out' })
    return json(500, { error: 'internal error' })
  }
})
