/**
 * Standard Web Push (#189) with WebCrypto only: a VAPID JWT (RFC 8292, ES256)
 * and an aes128gcm payload (RFC 8188 / RFC 8291), one record. No imports, so
 * the handler tests run it as is.
 *
 * Keys (edge secrets): VAPID_PUBLIC_KEY (uncompressed P-256 point, 65 bytes,
 * base64url: the same value as EXPO_PUBLIC_VAPID_PUBLIC_KEY), VAPID_PRIVATE_KEY
 * (the 32-byte private scalar, base64url) and VAPID_SUBJECT (mailto: or https:).
 * Without all three, web tokens are skipped (vapidFromEnv returns null).
 */

/** Bytes backed by a plain ArrayBuffer (what WebCrypto accepts). */
export type Bytes = Uint8Array<ArrayBuffer>

export type Vapid = { publicKey: string; privateKey: string; subject: string }
export type WebKeys = { p256dh: string; auth: string }
export type WebPushPayload = { title: string; body: string; deep_link?: string; tag?: string }

/** Push services must keep a payload under 4 KB; ours stays well under. */
export const WEB_PUSH_MAX_PAYLOAD = 2048
export const WEB_PUSH_TTL_SECONDS = 24 * 60 * 60
const RECORD_SIZE = 4096

export function vapidFromEnv(env: (name: string) => string | undefined): Vapid | null {
  const publicKey = env('VAPID_PUBLIC_KEY')?.trim()
  const privateKey = env('VAPID_PRIVATE_KEY')?.trim()
  const subject = env('VAPID_SUBJECT')?.trim()
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null
}

/** A row's web_keys, or null when it isn't a usable subscription. */
export function parseWebKeys(v: unknown): WebKeys | null {
  if (!v || typeof v !== 'object') return null
  const { p256dh, auth } = v as Record<string, unknown>
  return typeof p256dh === 'string' && typeof auth === 'string' && p256dh && auth ? { p256dh, auth } : null
}

/** Only https push service endpoints (never our own or a plain-http host). */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.username && !u.password
  } catch {
    return false
  }
}

export function b64urlEncode(bytes: Bytes): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Bytes {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

const text = (s: string): Bytes => new TextEncoder().encode(s) as Bytes

/** The VAPID private scalar + public point as a signing key. */
function importVapidKey(v: Vapid): Promise<CryptoKey> {
  const pub = b64urlDecode(v.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 point')
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)),
    d: v.privateKey,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** `vapid t=<jwt>, k=<public key>` for one push service origin. */
export async function vapidAuthorization(v: Vapid, endpoint: string, nowMs: number): Promise<string> {
  const header = b64urlEncode(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(text(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + 12 * 60 * 60,
    sub: v.subject,
  })))
  const unsigned = `${header}.${claims}`
  const key = await importVapidKey(v)
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(unsigned)))
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${v.publicKey}`
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/**
 * RFC 8291 aes128gcm body for one subscription. `ephemeral` and `salt` are for
 * tests; production makes fresh ones every time.
 */
export async function encryptPayload(
  keys: WebKeys,
  plaintext: Bytes,
  opts: { ephemeral?: CryptoKeyPair; salt?: Bytes } = {},
): Promise<Bytes> {
  const uaPublic = b64urlDecode(keys.p256dh)
  const authSecret = b64urlDecode(keys.auth)
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const as = opts.ephemeral ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(text('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // One record: the plaintext, then the 0x02 "last record" delimiter.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed)
}

/** What a web push looks like on the wire, trimmed to fit WEB_PUSH_MAX_PAYLOAD. */
export function webPushBody(p: WebPushPayload): Bytes {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  let payload: WebPushPayload = { ...p, title: clip(p.title, 120), body: clip(p.body, 400) }
  let bytes = text(JSON.stringify(payload))
  if (bytes.length > WEB_PUSH_MAX_PAYLOAD) {
    payload = { ...payload, body: clip(payload.body, 120) }
    bytes = text(JSON.stringify(payload))
  }
  return bytes
}

/** The fetch the handlers get (Deps['fetch']). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type WebPushResult = { ok: boolean; gone: boolean; status: number }

/** POST one encrypted push. `gone` (404/410) means the subscription should be deleted. */
export async function sendWebPush(
  fetchImpl: FetchLike,
  vapid: Vapid,
  endpoint: string,
  keys: WebKeys,
  payload: WebPushPayload,
  nowMs: number,
): Promise<WebPushResult> {
  const body = await encryptPayload(keys, webPushBody(payload))
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(vapid, endpoint, nowMs),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(WEB_PUSH_TTL_SECONDS),
      Urgency: 'normal',
      ...(payload.tag ? { Topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
    },
    body,
  })
  await res.body?.cancel().catch(() => {})
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status }
}

export type WebToken = { token: string; web_keys: unknown }

/**
 * Sends one payload to every web token. Returns the endpoints to delete
 * (gone, malformed or not an https push endpoint) and how many went out.
 * Never throws: a failure for one token is logged and the rest still send.
 */
export async function sendToWebTokens(
  fetchImpl: FetchLike,
  vapid: Vapid,
  tokens: WebToken[],
  payload: WebPushPayload,
  nowMs: number,
): Promise<{ sent: number; dead: string[] }> {
  const dead: string[] = []
  let sent = 0
  await Promise.all(tokens.map(async t => {
    const keys = parseWebKeys(t.web_keys)
    if (!keys || !isPushEndpoint(t.token)) { dead.push(t.token); return }
    try {
      const r = await sendWebPush(fetchImpl, vapid, t.token, keys, payload, nowMs)
      if (r.ok) sent++
      else if (r.gone) dead.push(t.token)
      else console.warn('web push returned HTTP', r.status)
    } catch (e) {
      console.error('web push failed', e instanceof Error ? e.message : String(e))
    }
  }))
  return { sent, dead }
}
