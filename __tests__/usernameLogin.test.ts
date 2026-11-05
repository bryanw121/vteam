import { clientIp, MIN_RESPONSE_MS, parseLoginBody, passwordGrantOutcome, remainingDelayMs, secretKeyFromEnv } from '../supabase/functions/_shared/usernameLogin'

describe('parseLoginBody', () => {
  it('normalizes the username', () => {
    expect(parseLoginBody({ username: '  E2EBot ', password: 'pw' })).toEqual({ username: 'e2ebot', password: 'pw' })
  })
  it.each([
    null, 'x', {}, { username: 'a' }, { password: 'p' }, { username: 1, password: 'p' },
    { username: '', password: 'p' }, { username: 'a', password: '' },
    { username: 'a@b.com', password: 'p' }, { username: 'a'.repeat(65), password: 'p' },
    { username: 'a', password: 'p'.repeat(129) },
  ])('rejects %p', body => {
    expect(parseLoginBody(body)).toBeNull()
  })
})

describe('remainingDelayMs', () => {
  it('pads fast answers up to the floor plus jitter', () => {
    expect(remainingDelayMs(1000, 1100, 50)).toBe(MIN_RESPONSE_MS + 50 - 100)
  })
  it('never waits once the floor has passed', () => {
    expect(remainingDelayMs(0, MIN_RESPONSE_MS + 500, 0)).toBe(0)
  })
})

describe('clientIp', () => {
  it('takes the first forwarded hop', () => {
    expect(clientIp('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7')
    expect(clientIp(null)).toBeNull()
    expect(clientIp('')).toBeNull()
  })
})

// The handler itself (CORS, limits before lookup, generic errors, IP forwarding)
// is tested in supabase/functions/login-with-username/handler.test.ts (deno).

describe('secretKeyFromEnv', () => {
  it('reads the default secret key', () => {
    expect(secretKeyFromEnv(JSON.stringify({ default: 'sb_secret_abc' }))).toBe('sb_secret_abc')
  })
  it('rejects missing, malformed or non-secret values', () => {
    expect(secretKeyFromEnv(undefined)).toBeNull()
    expect(secretKeyFromEnv('not json')).toBeNull()
    expect(secretKeyFromEnv(JSON.stringify({ default: 'eyJhbGciOi...' }))).toBeNull()
  })
})

describe('passwordGrantOutcome', () => {
  it('passes a session through', () => {
    const out = passwordGrantOutcome(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'bearer' })
    expect(out).toEqual({ kind: 'session', session: { access_token: 'a', refresh_token: 'r', expires_in: 3600, expires_at: undefined, token_type: 'bearer' } })
  })
  it.each([[400, { error_code: 'invalid_credentials' }], [429, { error_code: 'over_request_rate_limit' }], [500, null], [200, {}]])(
    'treats %s as rejected (same generic answer, so Auth 429s never reveal a real username)', (status, body) => {
      expect(passwordGrantOutcome(status, body)).toEqual({ kind: 'rejected' })
    })
})
