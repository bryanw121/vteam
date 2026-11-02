/**
 * Badge art (#10): the one place that defines how generated badge art looks.
 *
 * Every tier badge is drawn from the same template and style tokens below, so
 * the set stays consistent: change the look here (and only here), then
 * regenerate. The prompt is a pure function of the tier spec, so the same spec
 * always produces the same prompt.
 *
 * Pure helpers for generate-badge-art: no Deno globals and no URL imports, so
 * jest can import this file (__tests__/badgeArt.test.ts).
 */

export const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations'

/** Defaults; override with the OPENAI_IMAGE_MODEL / OPENAI_IMAGE_QUALITY secrets. */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-1.5'
export const DEFAULT_IMAGE_QUALITY = 'medium'
export const IMAGE_SIZE = '1024x1024'
const QUALITIES = ['low', 'medium', 'high'] as const

/** Storage bucket (public) and folder the PNGs are written to. */
export const BADGE_BUCKET = 'badges'
export const BADGE_ART_FOLDER = 'generated'
/** A decoded image larger than this is refused (a 1024px PNG is ~1-2 MB). */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024

// ─── Style tokens ─────────────────────────────────────────────────────────────
// Shared by every badge. Keep them short, concrete and stable.
export const BADGE_ART_STYLE = {
  medium: 'polished 3D game achievement badge, soft studio lighting, smooth enamel and brushed metal, subtle rim light',
  shape: 'one round emblem with a raised metal rim; the subject sits inside the emblem',
  palette: 'rich saturated colours, clean gradients, high contrast against both light and dark app backgrounds',
  composition: 'centred, front-facing, the emblem fills about 85% of the square canvas, fully transparent background, no cast shadow outside the badge',
  forbidden: 'no text, no letters, no numbers, no logos, no watermark, no people or faces, no photo-realism',
} as const

/**
 * Ornament grows with the tier so higher tiers read as rarer at a glance.
 * Indexed by rank 1-5 (see tierRank).
 */
export const TIER_ORNAMENT: Record<number, string> = {
  1: 'plain rim, minimal ornament',
  2: 'a thin engraved inner ring',
  3: 'small laurel leaves around the lower rim',
  4: 'faceted crystal accents and two small wings at the sides',
  5: 'a radiant halo, a small crown at the top and a few sparkles',
}

/** Metal finish per rank, matching BADGE_TIER_COLORS in constants/badges.ts. */
export const TIER_METAL: Record<number, string> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'diamond',
}

// ─── Request ──────────────────────────────────────────────────────────────────

export type BadgeArtSpec = {
  /** Badge key, as in BADGE_DEFINITIONS (e.g. 'serve_cheer'). */
  badge: string
  /** Display title of the badge (e.g. 'Serve'). */
  title: string
  /** What the badge is for, shown in the app (e.g. 'Receive serving cheers'). */
  description: string
  tier: number
  /** Tier label (e.g. 'Ace'). */
  tierName: string
  /** Number of tiers the badge has (1 for single-level badges). */
  maxTier: number
  /** Tier accent colour, #rrggbb. */
  accent: string
  /** The badge category's gradient, top and bottom, #rrggbb. */
  palette: [string, string]
  /** Ask for the prompt only: no image call, no upload, no row. */
  dryRun: boolean
}

const KEY_RE = /^[a-z0-9_]{1,40}$/
const HEX_RE = /^#[0-9a-f]{6}$/i

/** One line of plain text: no newlines or control characters, trimmed, capped. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 0 && text.length <= max ? text : null
}

function intIn(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

/** Validates the request body. Returns the spec, or an error message for a 400. */
export function parseBadgeArtRequest(body: unknown): { spec: BadgeArtSpec } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'body must be a JSON object' }
  const b = body as Record<string, unknown>
  const badge = typeof b.badge === 'string' && KEY_RE.test(b.badge) ? b.badge : null
  if (!badge) return { error: 'badge must match ^[a-z0-9_]{1,40}$' }
  const title = cleanText(b.title, 40)
  if (!title) return { error: 'title is required (1-40 characters)' }
  const description = cleanText(b.description, 120)
  if (!description) return { error: 'description is required (1-120 characters)' }
  const maxTier = intIn(b.maxTier, 1, 10)
  if (maxTier === null) return { error: 'maxTier must be an integer from 1 to 10' }
  const tier = intIn(b.tier, 1, maxTier)
  if (tier === null) return { error: 'tier must be an integer from 1 to maxTier' }
  const tierName = cleanText(b.tierName, 40)
  if (!tierName) return { error: 'tierName is required (1-40 characters)' }
  const accent = typeof b.accent === 'string' && HEX_RE.test(b.accent) ? b.accent.toUpperCase() : null
  if (!accent) return { error: 'accent must be a #rrggbb colour' }
  const palette = Array.isArray(b.palette) && b.palette.length === 2 && b.palette.every(c => typeof c === 'string' && HEX_RE.test(c))
    ? [(b.palette[0] as string).toUpperCase(), (b.palette[1] as string).toUpperCase()] as [string, string]
    : null
  if (!palette) return { error: 'palette must be two #rrggbb colours' }
  return { spec: { badge, title, description, tier, tierName, maxTier, accent, palette, dryRun: b.dryRun === true } }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

/**
 * Rank 1-5 for ornament and metal. A 5-tier badge maps 1:1; shorter ladders
 * spread across the range (a 3-tier badge is bronze, silver, gold); a
 * single-level badge is gold.
 */
export function tierRank(tier: number, maxTier: number): number {
  if (maxTier <= 1) return 3
  if (maxTier <= 5) return Math.min(tier, 5)
  return Math.max(1, Math.min(5, Math.ceil((tier / maxTier) * 5)))
}

/** The full image prompt for a tier. Deterministic: same spec, same prompt. */
export function badgeArtPrompt(spec: Pick<BadgeArtSpec, 'title' | 'description' | 'tier' | 'tierName' | 'maxTier' | 'accent' | 'palette'>): string {
  const rank = tierRank(spec.tier, spec.maxTier)
  const level = spec.maxTier > 1 ? `tier ${spec.tier} of ${spec.maxTier}` : 'a one-time special achievement'
  return [
    'A single collectible achievement badge icon for a volleyball club app.',
    `Badge: "${spec.title}" (${spec.description}); this is ${level}, named "${spec.tierName}". Show a simple symbolic volleyball motif that fits that meaning.`,
    `Style: ${BADGE_ART_STYLE.medium}.`,
    `Shape: ${BADGE_ART_STYLE.shape}.`,
    `Colour: ${TIER_METAL[rank]} rim with accent ${spec.accent}; emblem fill a gradient from ${spec.palette[0]} to ${spec.palette[1]}; ${BADGE_ART_STYLE.palette}.`,
    `Tier ornament: ${TIER_ORNAMENT[rank]}.`,
    `Composition: ${BADGE_ART_STYLE.composition}.`,
    `Avoid: ${BADGE_ART_STYLE.forbidden}.`,
  ].join('\n')
}

// ─── Image API ────────────────────────────────────────────────────────────────

export type ImageEnv = { apiKey?: string; model?: string; quality?: string }

export function imageModel(env: ImageEnv): string {
  return env.model?.trim() || DEFAULT_IMAGE_MODEL
}

export function imageQuality(env: ImageEnv): string {
  const q = env.quality?.trim()
  return q && (QUALITIES as readonly string[]).includes(q) ? q : DEFAULT_IMAGE_QUALITY
}

/** Body for POST /v1/images/generations: one transparent 1024px PNG. */
export function openAiImageBody(prompt: string, env: ImageEnv) {
  return {
    model: imageModel(env),
    prompt,
    n: 1,
    size: IMAGE_SIZE,
    quality: imageQuality(env),
    background: 'transparent',
    output_format: 'png',
  }
}

/** Storage object path. A new file per generation, so cached copies of the old art never linger. */
export function badgeArtPath(badge: string, tier: number, now: number): string {
  return `${BADGE_ART_FOLDER}/${badge}/tier${tier}-${now}.png`
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > PNG_MAGIC.length && PNG_MAGIC.every((b, i) => bytes[i] === b)
}

/** Decodes the base64 image of an Images API response, or null if it is missing. */
export function decodeImage(response: unknown): Uint8Array | null {
  const b64 = (response as { data?: { b64_json?: unknown }[] } | null)?.data?.[0]?.b64_json
  if (typeof b64 !== 'string' || b64.length === 0) return null
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ─── Admin check ──────────────────────────────────────────────────────────────

type DbError = { code?: string; message?: string } | null
type Lookup = () => PromiseLike<{ data: unknown; error: DbError }>

/** PostgREST / Postgres codes for "that table does not exist". */
const MISSING_TABLE = new Set(['PGRST205', '42P01'])

/**
 * Whether the caller is an app admin. #102 moves admins from
 * profiles.is_admin to public.app_admins (and keeps the column false), so
 * app_admins wins when it exists; before that, profiles.is_admin decides.
 * Both lookups run with the service role, filtered to the caller's id.
 */
export async function isAdmin(fromAppAdmins: Lookup, fromProfiles: Lookup): Promise<boolean> {
  const admins = await fromAppAdmins()
  if (!admins.error) return Array.isArray(admins.data) ? admins.data.length > 0 : admins.data != null
  if (!MISSING_TABLE.has(admins.error.code ?? '')) throw new Error(admins.error.message ?? 'app_admins lookup failed')
  const profile = await fromProfiles()
  if (profile.error) throw new Error(profile.error.message ?? 'profiles lookup failed')
  return (profile.data as { is_admin?: boolean } | null)?.is_admin === true
}
