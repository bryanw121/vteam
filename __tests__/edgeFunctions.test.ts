import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Static guards for the Deno edge functions, which jest cannot execute.
 * They protect the security-relevant wiring: who authenticates, which
 * supabase-js version is loaded, and what supabase/config.toml declares.
 */

const root = join(__dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const sendPush = read('supabase/functions/send-chat-push/index.ts')
const notificationPush = read('supabase/functions/send-notification-push/index.ts')
const checkReceipts = read('supabase/functions/check-push-receipts/index.ts')
const places = read('supabase/functions/places-proxy/index.ts')
const shared = read('supabase/functions/_shared/supabase.ts')
const config = read('supabase/config.toml')

describe('push functions authenticate callers themselves', () => {
  it.each([
    ['send-chat-push', sendPush],
    ['send-notification-push', notificationPush],
    ['check-push-receipts', checkReceipts],
  ])('%s calls requireWebhookAuth before touching the database', (_name, source) => {
    expect(source).toMatch(/import \{ requireWebhookAuth \} from '\.\.\/_shared\/webhook\.ts'/)
    const authAt = source.indexOf('requireWebhookAuth(req)')
    const clientAt = source.indexOf('getServiceClient()')
    expect(authAt).toBeGreaterThan(-1)
    expect(clientAt).toBeGreaterThan(authAt)
  })

  it.each([
    ['send-chat-push', sendPush],
    ['send-notification-push', notificationPush],
  ])('%s answers malformed JSON with 400', (_name, source) => {
    expect(source).toMatch(/catch \{\s*return new Response\('Invalid JSON', \{ status: 400 \}\)/)
  })
})

describe('shared supabase-js import', () => {
  const pinned = shared.match(/from 'https:\/\/esm\.sh\/@supabase\/supabase-js@([^']+)'/)?.[1]

  it('is pinned to an exact version', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('matches the version the app resolves from package-lock.json', () => {
    const lock = JSON.parse(read('package-lock.json'))
    expect(lock.packages['node_modules/@supabase/supabase-js'].version).toBe(pinned)
  })

  it('is the only place functions import it from a URL', () => {
    for (const source of [sendPush, notificationPush, checkReceipts, places]) {
      expect(source).not.toMatch(/esm\.sh/)
    }
  })
})

describe('supabase/config.toml', () => {
  const verifyJwt = (fn: string) =>
    config.match(new RegExp(`\\[functions\\.${fn}\\]\\s*\\n\\s*verify_jwt\\s*=\\s*(true|false)`))?.[1]

  it('turns JWT verification off only for the self-authenticating push functions', () => {
    expect(verifyJwt('send-chat-push')).toBe('false')
    expect(verifyJwt('send-notification-push')).toBe('false')
    expect(verifyJwt('check-push-receipts')).toBe('false')
  })

  it('keeps JWT verification on for places-proxy', () => {
    expect(verifyJwt('places-proxy')).toBe('true')
  })
})

describe('places-proxy CORS', () => {
  it('only falls back to * when ALLOWED_ORIGINS is unset', () => {
    expect(places).toMatch(/Deno\.env\.get\('ALLOWED_ORIGINS'\)/)
    const wildcards = places.match(/'Access-Control-Allow-Origin': '\*'/g) ?? []
    expect(wildcards).toHaveLength(1)
    expect(places).toMatch(/if \(!allowed\.length\)[\s\S]{0,200}'\*'/)
  })
})
