/**
 * Where feedback / bug submissions are emailed (CLAUDE.md "Feature Requests &
 * Bug Submission"). This is the one place to change it.
 *
 * The app never sends this address anywhere: the `send-feedback-email` edge
 * function decides the destination server-side, from its `FEEDBACK_EMAIL`
 * secret when set, otherwise from its built-in default, which
 * `__tests__/feedbackEmail.test.ts` pins to this constant. So:
 *   - change it here (the test then tells you to update the function default
 *     in supabase/functions/_shared/feedback.ts and redeploy), or
 *   - override it without a release by setting the `FEEDBACK_EMAIL` function secret.
 */
export const FEEDBACK_EMAIL = 'bryan.wu.121@gmail.com'

/** Emails per user per rolling hour. Submissions over the limit are still saved; only the email is skipped. */
export const FEEDBACK_EMAILS_PER_HOUR = 5
