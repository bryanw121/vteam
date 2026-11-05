import { readFileSync } from 'fs'
import { join } from 'path'
import { FEEDBACK_EMAIL, FEEDBACK_EMAILS_PER_HOUR } from '../constants/feedback'
import {
  buildFeedbackEmail,
  decideFeedbackSend,
  DEFAULT_FEEDBACK_EMAIL,
  DEFAULT_FEEDBACK_FROM,
  FEEDBACK_EMAILS_PER_HOUR as FN_PER_HOUR,
  parseFeedbackRequest,
  resendPayload,
  type FeedbackRow,
  type Reporter,
} from '../supabase/functions/_shared/feedback'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const NOW = Date.parse('2026-10-28T12:00:00Z')
const row: FeedbackRow = {
  id: '11111111-2222-4333-8444-555555555555', user_id: 'u1', kind: 'bug', priority: 'high',
  title: 'Calendar <b>breaks</b>\r\nBcc: x@y.z', description: 'Steps & stuff <script>alert(1)</script>',
  repro_steps: null, created_at: '2026-10-28T11:59:00Z',
}
const reporter: Reporter = { id: 'u1', username: 'pat', first_name: 'Pat', last_name: 'Lee', email: 'pat@example.com' }
const env = { resendApiKey: 're_test' }
const decide = (o: Partial<Parameters<typeof decideFeedbackSend>[0]> = {}) =>
  decideFeedbackSend({ row, callerId: 'u1', recentCount: 1, alreadySent: false, env, now: NOW, ...o })

describe('one source of truth for the destination', () => {
  it('the function default equals constants/feedback.ts (change both, or set the FEEDBACK_EMAIL secret)', () => {
    expect(DEFAULT_FEEDBACK_EMAIL).toBe(FEEDBACK_EMAIL)
    expect(FN_PER_HOUR).toBe(FEEDBACK_EMAILS_PER_HOUR)
  })

  it('the app never hardcodes or sends the address: only constants/feedback.ts holds it', () => {
    const screen = read('app/(app)/(tabs)/settings/feedback.tsx')
    const client = read('lib/feedback.ts')
    for (const src of [screen, client]) expect(src).not.toMatch(/@gmail\.com|FEEDBACK_EMAIL/)
    expect(client).toMatch(/invoke\('send-feedback-email', \{ body: \{ id \} \}\)/)
  })
})

describe('parseFeedbackRequest', () => {
  it('accepts only { id: uuid }', () => {
    expect(parseFeedbackRequest({ id: row.id })).toBe(row.id)
    for (const bad of [null, {}, { id: 5 }, { id: 'abc' }, { id: `${row.id}' or 1=1` }]) expect(parseFeedbackRequest(bad)).toBeNull()
  })
})

describe('decideFeedbackSend', () => {
  it('sends a fresh submission the caller owns', () => {
    expect(decide()).toEqual({ ok: true })
  })
  it('refuses missing rows and other people\'s rows before revealing config', () => {
    expect(decide({ row: null, env: {} })).toMatchObject({ status: 404 })
    expect(decide({ callerId: 'someone-else', env: {} })).toMatchObject({ status: 403 })
  })
  it('refuses replays of old or already-emailed submissions', () => {
    expect(decide({ now: NOW + 16 * 60_000 })).toMatchObject({ status: 410 })
    expect(decide({ row: { ...row, created_at: 'garbage' } })).toMatchObject({ status: 410 })
    expect(decide({ alreadySent: true })).toMatchObject({ status: 409 })
  })
  it('allows 5 an hour per user and refuses the 6th', () => {
    expect(decide({ recentCount: 5 })).toEqual({ ok: true })
    expect(decide({ recentCount: 6 })).toMatchObject({ status: 429, error: 'rate limited' })
  })
  it('answers 503 "email not configured" without RESEND_API_KEY', () => {
    expect(decide({ env: {} })).toEqual({ ok: false, status: 503, error: 'email not configured' })
  })
})

describe('email content', () => {
  it('escapes user text in HTML and keeps the subject on one line', () => {
    const { subject, html, text } = buildFeedbackEmail(row, reporter)
    expect(subject).toBe('[vteam Bug · high] Calendar <b>breaks</b> Bcc: x@y.z')
    expect(subject).not.toMatch(/[\r\n]/)
    expect(html).not.toMatch(/<script>|<b>breaks/)
    expect(html).toContain('&lt;script&gt;')
    expect(text).toContain('From: Pat Lee (@pat)')
    expect(text).toContain(`Submission id: ${row.id}`)
  })

  it('goes to the configured destination, from the configured sender, with the reporter as Reply-To', () => {
    expect(resendPayload(row, reporter, env)).toMatchObject({ to: [DEFAULT_FEEDBACK_EMAIL], from: DEFAULT_FEEDBACK_FROM, reply_to: 'pat@example.com' })
    expect(resendPayload(row, { ...reporter, email: null }, { ...env, feedbackEmail: ' team@vteam.app ', feedbackFrom: 'x <a@b.c>' }))
      .toMatchObject({ to: ['team@vteam.app'], from: 'x <a@b.c>' })
    expect(resendPayload(row, { ...reporter, email: null }, env)).not.toHaveProperty('reply_to')
  })
})

describe('send-feedback-email wiring', () => {
  const fn = read('supabase/functions/send-feedback-email/handler.ts')
  it('identifies the caller from the JWT and loads the row server-side', () => {
    expect(fn).toMatch(/auth\.getUser\(jwt\)/)
    expect(fn).toMatch(/from\('feedback_submissions'\)[\s\S]*\.eq\('id', id\)/)
    expect(fn).toMatch(/\.eq\('user_id', caller\.id\)/)
    expect(fn).not.toMatch(/esm\.sh/)
  })
  it('reads the destination and key only from secrets', () => {
    expect(fn).toMatch(/deps\.env\('RESEND_API_KEY'\)/)
    expect(fn).toMatch(/deps\.env\('FEEDBACK_EMAIL'\)/)
    expect(fn).toMatch(/deps\.env\('FEEDBACK_FROM'\)/)
  })
  it('is JWT-verified by the gateway', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.send-feedback-email\]\s*\n\s*verify_jwt\s*=\s*true/)
  })
})
