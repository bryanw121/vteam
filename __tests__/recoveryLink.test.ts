import { parseRecoveryLink } from '../utils/recoveryLink'

describe('parseRecoveryLink (#223)', () => {
  it('reads a good reset link', () => {
    expect(parseRecoveryLink('#access_token=a&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery')).toBe('recovery')
  })

  it('reads an expired or used link, in the hash or the query string', () => {
    expect(parseRecoveryLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe('expired')
    expect(parseRecoveryLink('', '?error=access_denied&error_code=otp_expired')).toBe('expired')
  })

  it('ignores ordinary hashes and other sign-ins', () => {
    expect(parseRecoveryLink('')).toBeNull()
    expect(parseRecoveryLink('#section-2')).toBeNull()
    expect(parseRecoveryLink('#access_token=a&refresh_token=r&type=signup')).toBeNull()
    expect(parseRecoveryLink('#access_token=a&refresh_token=r&type=magiclink')).toBeNull()
  })

  it('ignores errors that are not an expired email link', () => {
    expect(parseRecoveryLink('', '?error=access_denied&error_description=User+cancelled')).toBeNull()
    expect(parseRecoveryLink('#error=server_error&error_code=unexpected_failure')).toBeNull()
    expect(parseRecoveryLink('#error_code=otp_expired&type=signup')).toBeNull()
  })
})
