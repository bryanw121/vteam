import type { FeedbackFieldErrors, FeedbackKind } from '../types'

/** What's missing on the feedback form, per field (empty when it can be sent). */
export function feedbackErrors(form: { kind: FeedbackKind; title: string; description: string; platform: string | null }): FeedbackFieldErrors {
  const errors: FeedbackFieldErrors = {}
  if (!form.title.trim()) errors.title = 'Add a short title.'
  if (!form.description.trim()) errors.description = 'Add a description.'
  if (form.kind === 'bug' && !form.platform) errors.platform = 'Choose where you saw the bug.'
  return errors
}
