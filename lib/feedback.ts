import { supabase } from './supabase'
import { Sentry } from './sentry'

/**
 * Ask the `send-feedback-email` edge function to email a stored submission to
 * the team (#9). Fire and forget: the row is already saved, so the form shows
 * success whatever happens here. Only the row id is sent; the function loads
 * the row itself and decides the destination (see constants/feedback.ts).
 *
 * Expected non-2xx answers are not errors worth reporting: 503 (email not set
 * up yet), 429 (over 5 an hour), 409 (already emailed). Anything else is reported
 * to Sentry.
 */
export function emailFeedback(id: string): void {
  void supabase.functions.invoke('send-feedback-email', { body: { id } }).then(
    ({ error }) => {
      if (!error) return
      const status = (error as { context?: { status?: number } }).context?.status
      if (status === 503 || status === 429 || status === 409) return
      Sentry.captureMessage(`send-feedback-email failed${status ? ` (${status})` : ''}`)
    },
    () => {},
  )
}
