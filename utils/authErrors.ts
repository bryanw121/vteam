/**
 * Whether a sendEmailOtp error only means "no account uses this email"
 * (sign-ups are off for email codes). The login screen treats it like a sent
 * code so the form can't be used to check which emails have accounts.
 */
export function isUnknownEmailOtpError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null
  return err?.code === 'otp_disabled' || /signups? not allowed/i.test(err?.message ?? '')
}
