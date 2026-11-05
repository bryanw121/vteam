import {
  isAuthorized,
  requireWebhookAuth,
  timingSafeEqual,
} from '../supabase/functions/_shared/webhook'

const SERVICE_KEY = 'service-role-key-abc.def.ghi'
const SECRET = 'webhook-secret-123'

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('timingSafeEqual', () => {
  it('matches equal strings and rejects different ones', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
  })

  it('rejects a prefix or an extension of the real value', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('abcd', 'abc')).toBe(false)
    expect(timingSafeEqual('', 'a')).toBe(false)
  })

  it('compares multi-byte characters by bytes', () => {
    expect(timingSafeEqual('é', 'é')).toBe(true)
    expect(timingSafeEqual('é', 'e')).toBe(false)
  })
})

describe('isAuthorized', () => {
  const env = { serviceRoleKey: SERVICE_KEY, webhookSecret: SECRET }

  it('accepts the service-role key as a bearer token', () => {
    expect(isAuthorized(headers({ authorization: `Bearer ${SERVICE_KEY}` }), env)).toBe(true)
  })

  it('accepts the scheme in any case and tolerates extra spaces', () => {
    expect(isAuthorized(headers({ authorization: `bearer   ${SERVICE_KEY}` }), env)).toBe(true)
  })

  it('accepts the webhook secret header', () => {
    expect(isAuthorized(headers({ 'x-webhook-secret': SECRET }), env)).toBe(true)
  })

  it('accepts the bearer when WEBHOOK_SECRET is not configured (the optional-secret case)', () => {
    expect(isAuthorized(headers({ authorization: `Bearer ${SERVICE_KEY}` }), { serviceRoleKey: SERVICE_KEY })).toBe(true)
  })

  it('accepts either credential when the other one is wrong', () => {
    expect(isAuthorized(headers({ authorization: 'Bearer nope', 'x-webhook-secret': SECRET }), env)).toBe(true)
    expect(isAuthorized(headers({ authorization: `Bearer ${SERVICE_KEY}`, 'x-webhook-secret': 'nope' }), env)).toBe(true)
  })

  it('rejects a request with no credentials', () => {
    expect(isAuthorized(headers({}), env)).toBe(false)
  })

  it('rejects wrong tokens, including near misses', () => {
    expect(isAuthorized(headers({ authorization: 'Bearer wrong' }), env)).toBe(false)
    expect(isAuthorized(headers({ authorization: `Bearer ${SERVICE_KEY}x` }), env)).toBe(false)
    expect(isAuthorized(headers({ authorization: `Bearer ${SERVICE_KEY.slice(0, -1)}` }), env)).toBe(false)
    expect(isAuthorized(headers({ 'x-webhook-secret': `${SECRET}x` }), env)).toBe(false)
  })

  it('rejects other schemes and a bare token', () => {
    expect(isAuthorized(headers({ authorization: `Basic ${SERVICE_KEY}` }), env)).toBe(false)
    expect(isAuthorized(headers({ authorization: SERVICE_KEY }), env)).toBe(false)
  })

  it('does not take the service-role key from x-webhook-secret, or the secret from the bearer', () => {
    expect(isAuthorized(headers({ 'x-webhook-secret': SERVICE_KEY }), env)).toBe(false)
    expect(isAuthorized(headers({ authorization: `Bearer ${SECRET}` }), env)).toBe(false)
  })

  it('fails closed when the env is unset or empty, even for an empty credential', () => {
    expect(isAuthorized(headers({ authorization: `Bearer ${SERVICE_KEY}` }), {})).toBe(false)
    expect(isAuthorized(headers({ 'x-webhook-secret': SECRET }), {})).toBe(false)
    expect(isAuthorized(headers({ 'x-webhook-secret': '' }), { webhookSecret: '' })).toBe(false)
    expect(isAuthorized(headers({ authorization: 'Bearer ' }), { serviceRoleKey: '' })).toBe(false)
  })

  it('ignores the secret header when only the service key is configured', () => {
    expect(isAuthorized(headers({ 'x-webhook-secret': SECRET }), { serviceRoleKey: SERVICE_KEY })).toBe(false)
  })
})

describe('requireWebhookAuth', () => {
  const globals = globalThis as { Deno?: unknown }
  const original = globals.Deno

  function withEnv(values: Record<string, string>) {
    globals.Deno = { env: { get: (key: string) => values[key] } }
  }

  afterEach(() => {
    globals.Deno = original
  })

  it('returns null for an authorized request', () => {
    withEnv({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY })
    const req = { headers: headers({ authorization: `Bearer ${SERVICE_KEY}` }) } as Request
    expect(requireWebhookAuth(req)).toBeNull()
  })

  it('returns a 401 response otherwise', () => {
    withEnv({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, WEBHOOK_SECRET: SECRET })
    const req = { headers: headers({ authorization: 'Bearer wrong' }) } as Request
    expect(requireWebhookAuth(req)?.status).toBe(401)
  })

  it('reads the env reader it is given instead of Deno.env', () => {
    globals.Deno = undefined
    const env = (key: string) => ({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY } as Record<string, string>)[key]
    const req = { headers: headers({ authorization: `Bearer ${SERVICE_KEY}` }) } as Request
    expect(requireWebhookAuth(req, env)).toBeNull()
    expect(requireWebhookAuth({ headers: headers({}) } as Request, env)?.status).toBe(401)
  })

  it('returns 401 (not a crash) when run outside Deno with no env', () => {
    globals.Deno = undefined
    const req = { headers: headers({ authorization: `Bearer ${SERVICE_KEY}` }) } as Request
    expect(requireWebhookAuth(req)?.status).toBe(401)
  })
})
