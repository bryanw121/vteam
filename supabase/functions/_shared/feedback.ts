/**
 * Pure helpers for send-feedback-email: the send decision, the email body
 * and the Resend request. No Deno globals and no URL imports, so jest can
 * import this file (__tests__/feedbackEmail.test.ts).
 */

/** Must equal FEEDBACK_EMAIL in constants/feedback.ts (a unit test checks). Overridden by the FEEDBACK_EMAIL secret. */
export const DEFAULT_FEEDBACK_EMAIL = 'bryan.wu.121@gmail.com'
/** Overridden by the FEEDBACK_FROM secret. The domain must be verified in Resend. */
export const DEFAULT_FEEDBACK_FROM = 'vteam <feedback@vteamvolleyball.com>'
/** Must equal FEEDBACK_EMAILS_PER_HOUR in constants/feedback.ts. */
export const FEEDBACK_EMAILS_PER_HOUR = 5
/** Only a fresh submission can be emailed, so an old id can't be replayed to re-send. */
export const FEEDBACK_MAX_AGE_MS = 15 * 60_000
export const RESEND_URL = 'https://api.resend.com/emails'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FeedbackRow = {
  id: string
  user_id: string
  kind: string
  priority: string
  title: string
  description: string
  repro_steps: string | null
  created_at: string
}

export type Reporter = {
  id: string
  username: string | null
  first_name: string | null
  last_name: string | null
  /** The account email, used as Reply-To so a reply reaches the person. */
  email: string | null
}

export type FeedbackEnv = {
  resendApiKey?: string
  feedbackEmail?: string
  feedbackFrom?: string
}

export type SendDecision =
  | { ok: true }
  | { ok: false; status: number; error: string }

/** The `{ id }` body, or null when it isn't one uuid. */
export function parseFeedbackRequest(body: unknown): string | null {
  const id = (body as { id?: unknown } | null)?.id
  return typeof id === 'string' && UUID_RE.test(id) ? id : null
}

/**
 * Whether this caller may have this row emailed now. Order matters: the
 * ownership check runs before anything reveals whether email is configured.
 */
export function decideFeedbackSend(args: {
  row: FeedbackRow | null
  callerId: string
  /** Submissions by the caller in the last hour, including this one. */
  recentCount: number
  alreadySent: boolean
  env: FeedbackEnv
  now: number
}): SendDecision {
  const { row } = args
  if (!row) return { ok: false, status: 404, error: 'submission not found' }
  if (row.user_id !== args.callerId) return { ok: false, status: 403, error: 'not your submission' }
  const age = args.now - Date.parse(row.created_at)
  if (!(age <= FEEDBACK_MAX_AGE_MS)) return { ok: false, status: 410, error: 'submission too old to email' }
  if (args.alreadySent) return { ok: false, status: 409, error: 'already emailed' }
  if (args.recentCount > FEEDBACK_EMAILS_PER_HOUR) return { ok: false, status: 429, error: 'rate limited' }
  if (!args.env.resendApiKey) return { ok: false, status: 503, error: 'email not configured' }
  return { ok: true }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Header-safe single line: no CR/LF, capped. */
function oneLine(s: string, max: number): string {
  const flat = s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

export function reporterName(r: Reporter): string {
  const full = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
  if (full && r.username) return `${full} (@${r.username})`
  return full || (r.username ? `@${r.username}` : r.id)
}

/** Subject, plain-text and HTML bodies. Everything user-written is escaped in the HTML. */
export function buildFeedbackEmail(row: FeedbackRow, reporter: Reporter) {
  const kind = row.kind === 'bug' ? 'Bug' : 'Feature'
  const subject = `[vteam ${kind} · ${row.priority}] ${oneLine(row.title, 120)}`
  const who = reporterName(reporter)
  const fields: [string, string][] = [
    ['Type', kind],
    ['Priority', row.priority],
    ['From', who],
    ['User id', row.user_id],
    ['Submitted', row.created_at],
    ['Submission id', row.id],
  ]
  const text = [
    row.title,
    '',
    row.description,
    ...(row.repro_steps ? ['', 'Steps to reproduce:', row.repro_steps] : []),
    '',
    '—',
    ...fields.map(([k, v]) => `${k}: ${v}`),
  ].join('\n')
  const pre = (s: string) => `<pre style="white-space:pre-wrap;font-family:inherit;margin:0 0 16px">${escapeHtml(s)}</pre>`
  const html = [
    `<h2 style="margin:0 0 12px">${escapeHtml(row.title)}</h2>`,
    pre(row.description),
    row.repro_steps ? `<h3 style="margin:0 0 8px">Steps to reproduce</h3>${pre(row.repro_steps)}` : '',
    '<table style="border-collapse:collapse;color:#555;font-size:13px">',
    ...fields.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`),
    '</table>',
  ].join('')
  return { subject, text, html }
}

/** The JSON body for Resend's POST /emails. */
export function resendPayload(row: FeedbackRow, reporter: Reporter, env: FeedbackEnv) {
  const { subject, text, html } = buildFeedbackEmail(row, reporter)
  const replyTo = reporter.email && /^[^\s@<>]+@[^\s@<>]+$/.test(reporter.email) ? reporter.email : undefined
  return {
    from: env.feedbackFrom?.trim() || DEFAULT_FEEDBACK_FROM,
    to: [env.feedbackEmail?.trim() || DEFAULT_FEEDBACK_EMAIL],
    subject,
    text,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  }
}
