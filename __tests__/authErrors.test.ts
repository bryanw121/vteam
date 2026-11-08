import { isUnknownEmailOtpError } from '../utils/authErrors'

describe('isUnknownEmailOtpError', () => {
  it('recognises "no account for this email" from Supabase Auth', () => {
    expect(isUnknownEmailOtpError({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe(true)
    expect(isUnknownEmailOtpError({ message: 'Signups not allowed for otp' })).toBe(true)
  })
  it('leaves real failures alone', () => {
    expect(isUnknownEmailOtpError({ code: 'over_email_send_rate_limit', message: 'rate limit' })).toBe(false)
    expect(isUnknownEmailOtpError(new Error('Network request failed'))).toBe(false)
    expect(isUnknownEmailOtpError(null)).toBe(false)
  })
})
