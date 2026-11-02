/**
 * Pure helpers for the read-roster edge function (scorekeeper "Scan roster"): validate the
 * photo, build the vision-model request, and clean what comes back into a roster. Kept free of
 * Deno APIs so Jest can test it.
 */

export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
export const ROSTER_MODEL = 'gpt-4o-mini'
/** Base64 length cap (about 4.5 MB of image). */
export const MAX_IMAGE_BASE64 = 6_000_000
export const MAX_PLAYERS = 30
/** Scans per user per hour (per function instance; best effort). */
export const SCANS_PER_HOUR = 20

const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
export type ScanRequest = { image: string; mime: (typeof MIMES)[number] }
export type ScannedPlayer = { number: number; name?: string; libero?: boolean; captain?: boolean }
export type ScanResult = { teamName: string | null; players: ScannedPlayer[] }

/** The request body, or an error message for a 400. */
export function parseScanRequest(body: unknown): ScanRequest | string {
  if (!body || typeof body !== 'object') return 'body must be { image, mime }'
  const { image, mime } = body as Record<string, unknown>
  if (typeof image !== 'string' || !image) return 'image (base64) is required'
  if (image.length > MAX_IMAGE_BASE64) return 'photo is too large'
  if (!/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 2000))) return 'image must be base64'
  const m = typeof mime === 'string' ? mime.toLowerCase() : 'image/jpeg'
  if (!(MIMES as readonly string[]).includes(m)) return 'unsupported image type'
  return { image: image.replace(/\s+/g, ''), mime: m as ScanRequest['mime'] }
}

const PROMPT = [
  'This photo shows a volleyball team roster, lineup card, scoresheet or list of players (printed or handwritten).',
  'List every player you can read with their jersey number and name.',
  'Mark libero true when the player is marked as a libero (L, Lib, a different color jersey note) and captain true when marked C or Capt.',
  'If the team name is written, return it. Never invent players, numbers or names: leave a name empty if you cannot read it,',
  'and skip anyone whose number you cannot read. If the photo has no roster, return an empty list.',
].join(' ')

/** Chat Completions body asking for structured JSON. */
export function openaiPayload(req: ScanRequest) {
  return {
    model: ROSTER_MODEL,
    temperature: 0,
    max_tokens: 1200,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'roster',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['teamName', 'players'],
          properties: {
            teamName: { type: ['string', 'null'] },
            players: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['number', 'name', 'libero', 'captain'],
                properties: {
                  number: { type: 'integer' },
                  name: { type: ['string', 'null'] },
                  libero: { type: 'boolean' },
                  captain: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    messages: [
      { role: 'system', content: 'You read volleyball rosters from photos and return only what is written.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:${req.mime};base64,${req.image}`, detail: 'high' } },
        ],
      },
    ],
  }
}

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : ''

/** Validates the model's JSON: numbers 0-99, one entry per number, trimmed names, capped length. */
export function normalizeRoster(raw: unknown): ScanResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(obj.players) ? obj.players : []
  const seen = new Set<number>()
  const players: ScannedPlayer[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const n = typeof p.number === 'number' ? p.number : Number(clean(p.number, 3))
    if (!Number.isInteger(n) || n < 0 || n > 99 || seen.has(n)) continue
    seen.add(n)
    const name = clean(p.name, 40)
    players.push({ number: n, ...(name ? { name } : {}), ...(p.libero === true ? { libero: true } : {}), ...(p.captain === true ? { captain: true } : {}) })
    if (players.length >= MAX_PLAYERS) break
  }
  const teamName = clean(obj.teamName, 40) || null
  return { teamName, players }
}

/** Reads the model's answer out of a Chat Completions response. */
export function rosterFromCompletion(body: unknown): ScanResult {
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return { teamName: null, players: [] }
  try {
    return normalizeRoster(JSON.parse(content))
  } catch {
    return { teamName: null, players: [] }
  }
}

/** Sliding-window rate limit: true when the user may scan now (and records the scan). */
export function allowScan(log: Map<string, number[]>, userId: string, now: number, limit = SCANS_PER_HOUR): boolean {
  const recent = (log.get(userId) ?? []).filter(t => now - t < 60 * 60_000)
  if (recent.length >= limit) {
    log.set(userId, recent)
    return false
  }
  recent.push(now)
  log.set(userId, recent)
  return true
}
