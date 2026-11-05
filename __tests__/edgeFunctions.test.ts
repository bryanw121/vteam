import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Static guards for the Deno edge functions. Jest cannot execute them; their
 * behaviour is tested under Deno (`<name>/handler.test.ts`, CI's "Edge
 * functions" job). These guards protect the security-relevant wiring: who
 * authenticates, which supabase-js version is loaded, what
 * supabase/config.toml declares, and the handler/index split that keeps the
 * handlers testable with no network.
 */

const root = join(__dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const FUNCTIONS = ['send-chat-push', 'send-notification-push', 'check-push-receipts', 'places-proxy', 'send-feedback-email', 'login-with-username']
const handler = (fn: string) => read(`supabase/functions/${fn}/handler.ts`)
const index = (fn: string) => read(`supabase/functions/${fn}/index.ts`)

const sendPush = handler('send-chat-push')
const notificationPush = handler('send-notification-push')
const checkReceipts = handler('check-push-receipts')
const places = handler('places-proxy')
const shared = read('supabase/functions/_shared/supabase.ts')
const config = read('supabase/config.toml')

describe('push functions authenticate callers themselves', () => {
  it.each([
    ['send-chat-push', sendPush],
    ['send-notification-push', notificationPush],
    ['check-push-receipts', checkReceipts],
  ])('%s calls requireWebhookAuth before touching the database', (_name, source) => {
    expect(source).toMatch(/import \{ requireWebhookAuth \} from '\.\.\/_shared\/webhook\.ts'/)
    const authAt = source.indexOf('requireWebhookAuth(req, deps.env)')
    const clientAt = source.indexOf('deps.getClient()')
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
    for (const fn of FUNCTIONS) {
      expect(handler(fn)).not.toMatch(/esm\.sh/)
      expect(index(fn)).not.toMatch(/esm\.sh/)
    }
  })
})

describe('handler / index split', () => {
  it.each(FUNCTIONS)('%s/index.ts only serves the handler with the real deps', (fn) => {
    const source = index(fn)
    const code = source.replace(/^\s*\/\/.*$/gm, '').trim()
    expect(code).toMatch(/^import \{ createHandler \} from '\.\/handler\.ts'\nimport \{ (defaultDeps|platformDeps) \} from '\.\.\/_shared\/(supabase|platform)\.ts'\n\nDeno\.serve\(createHandler\((defaultDeps|platformDeps)\)\)$/)
  })

  it.each(FUNCTIONS)('%s/handler.ts reaches the outside world only through deps', (fn) => {
    const source = handler(fn)
    expect(source).toMatch(/export function createHandler\(deps: /)
    // No supabase-js (needs the network to load) and no Deno globals or bare fetch.
    expect(source).not.toMatch(/_shared\/supabase\.ts/)
    expect(source).not.toMatch(/\bDeno\./)
    expect(source).not.toMatch(/(?<![.\w])fetch\(/)
    expect(source).not.toMatch(/Date\.now\(\)/)
  })

  it('places-proxy never loads supabase-js', () => {
    expect(index('places-proxy')).toMatch(/_shared\/platform\.ts/)
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

  it('turns JWT verification off for login-with-username (callers are signed out)', () => {
    expect(verifyJwt('login-with-username')).toBe('false')
  })

  it('keeps JWT verification on for places-proxy', () => {
    expect(verifyJwt('places-proxy')).toBe('true')
  })
})

describe('places-proxy CORS', () => {
  it('only falls back to * when ALLOWED_ORIGINS is unset', () => {
    expect(places).toMatch(/env\('ALLOWED_ORIGINS'\)/)
    const wildcards = places.match(/'Access-Control-Allow-Origin': '\*'/g) ?? []
    expect(wildcards).toHaveLength(1)
    expect(places).toMatch(/if \(!allowed\.length\)[\s\S]{0,200}'\*'/)
  })
})
