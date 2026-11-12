import { clientIp, GENERIC_LOGIN_ERROR, MIN_RESPONSE_MS, parseLoginBody, passwordGrantOutcome, remainingDelayMs, secretKeyFromEnv } from '../supabase/functions/_shared/usernameLogin'
import { readFileSync } from 'fs'
import { join } from 'path'

const fn = readFileSync(join(__dirname, '../supabase/functions/login-with-username/handler.ts'), 'utf8')

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

describe('login-with-username function', () => {
  it('answers an unknown username and any Auth failure with the same generic error', () => {
    // Both go through the same fail(), which counts the failed attempt and answers generically.
    expect(fn).toMatch(/if \(typeof email !== 'string' \|\| !email\) return fail\(\)/)
    expect(fn).toMatch(/if \(outcome\.kind !== 'session'\) return fail\(\)/)
    expect(fn).toMatch(/return finish\(\{ error: GENERIC_LOGIN_ERROR \}, 401\)\n {6}\}/)
    expect(GENERIC_LOGIN_ERROR).toBe('Incorrect username or password')
  })
  it('forwards the caller IP to Supabase Auth with a secret key', () => {
    expect(fn).toMatch(/headers\['Sb-Forwarded-For'\] = ip/)
    expect(fn).toMatch(/headers\.apikey = secret/)
  })
  it('never returns the resolved email', () => {
    expect(fn).not.toMatch(/json\([^)]*email/)
    expect(fn).not.toMatch(/finish\(\{[^}]*email/)
  })
  it('uses the service role for get_email_by_username', () => {
    expect(fn).toMatch(/const service = deps\.getClient\(\)/)
    expect(fn).toMatch(/service\s*\n\s*\.rpc\('get_email_by_username'/)
  })
  it('checks the rate limits before looking the username up (#11)', () => {
    const limitAt = fn.indexOf("rpc('check_rate_limit'")
    const lookupAt = fn.indexOf("rpc('get_email_by_username'")
    expect(limitAt).toBeGreaterThan(-1)
    expect(lookupAt).toBeGreaterThan(limitAt)
    expect(fn).toMatch(/allowed === false\) return finish\(\{ error: TOO_MANY_ATTEMPTS \}, 429\)/)
  })
})

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
