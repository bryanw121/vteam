/**
 * Who may read and write every public table (#186): the spec the RLS matrix
 * probes check on beta (e2e/rls.matrix.spec.ts, `api` shard), and that
 * __tests__/rlsMatrix.test.ts keeps complete against types/database.ts.
 *
 * Written from the policies on main (pg_policies), then reviewed by hand: the
 * matrix is the spec, not a dump. A PR that changes a policy changes its row.
 *
 * - `anonSelect`: what a guest (anon key) reads. 'all' = every row (no error),
 *   'some' = a filtered subset (no error; which rows is the feature's business),
 *   'none' = no rows (an empty result, or a permission error).
 * - `anonInsert`: 'none' = an insert must be rejected by RLS or grants (42501).
 *   'allowed' only with a reason; those are never probed (no write may succeed).
 * - `owner`: the column that ties a row to a user, when rows are private to
 *   them. A signed-in stranger (the e2e account) must read none of another
 *   user's rows (`ownRowsOnly`) and must not insert a row in another user's
 *   name (`noInsertAsOther`). Owner-allowed writes stay with the feature specs.
 * - `signedInSelect: 'none'`: service-only tables a signed-in user can't read either.
 * - `insertRejectedBy: 'trigger'`: a BEFORE INSERT trigger rejects the empty
 *   probe row (P0002) before RLS sees it; still a rejection, noted as such.
 * - `anonColumns`: for a table with column-level grants, the columns a guest may
 *   read; the guest read probe selects these instead of `*` (which is refused).
 * - `why`: one line for anything not 'none'.
 */
import type { Database } from '../../types/database'

export type TableName = keyof Database['public']['Tables']

export type RlsExpectation = {
  anonSelect: 'all' | 'some' | 'none'
  anonInsert: 'none' | 'allowed'
  owner?: { column: string; ownRowsOnly: boolean; noInsertAsOther: boolean }
  signedInSelect?: 'none'
  insertRejectedBy?: 'trigger'
  anonColumns?: string
  why?: string
}

export const RLS_MATRIX: Record<TableName, RlsExpectation> = {
  ad_banners: { anonSelect: 'some', anonInsert: 'none', why: 'guests see banners inside their window; admins write' },
  ad_free_passes: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true } },
  app_admins: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'no client access; checked server-side by current_user_is_admin() (#102)' },
  app_config: { anonSelect: 'all', anonInsert: 'none', why: 'min-version gate is read before sign-in' },
  app_events: { anonSelect: 'none', anonInsert: 'allowed', signedInSelect: 'none', why: 'usage metrics are insert-only for everyone (user_id null or own)' },
  app_events_daily: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only (server jobs)' },
  app_sessions: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'usage metrics: written only by app_heartbeat(), read only by admin functions' },
  app_online_samples: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only (minute job)' },
  app_online_daily: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only (nightly job)' },
  metrics_excluded_users: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only list of test accounts; read only by admin_metrics_overview' },
  chat_silences: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true } },
  cheers: { anonSelect: 'all', anonInsert: 'none', anonColumns: 'id, event_id, receiver_id, cheer_type, created_at', owner: { column: 'giver_id', ownRowsOnly: false, noInsertAsOther: true }, why: 'cheers counts show on public profiles; guests can\'t see giver_id (#102)' },
  club_members: { anonSelect: 'all', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true }, why: 'club pages list members to guests' },
  club_post_comments: { anonSelect: 'none', anonInsert: 'none' },
  club_post_likes: { anonSelect: 'none', anonInsert: 'none' },
  club_posts: { anonSelect: 'none', anonInsert: 'none' },
  clubs: { anonSelect: 'all', anonInsert: 'none', owner: { column: 'created_by', ownRowsOnly: false, noInsertAsOther: true }, why: 'guests browse clubs' },
  conversation_members: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true } },
  conversations: { anonSelect: 'none', anonInsert: 'none' },
  event_attendee_denials: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true }, why: 'denial reason: the attendee, host and co-hosts only; written by trigger (#102)' },
  event_attendees: { anonSelect: 'all', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true }, why: 'rosters are public on event pages' },
  event_bring_alert_log: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only: one "nobody is bringing it" alert per event (#256)' },
  event_bring_claims: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true }, why: 'who brings what is for signed-in users; writes only through claim_bring_item / release_bring_item (#256)' },
  event_bring_items: { anonSelect: 'all', anonInsert: 'none', why: 'the list shows on public event pages; hosts write through save_event_bring_items (#256)' },
  event_cohosts: { anonSelect: 'none', anonInsert: 'none' },
  event_comments: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true } },
  event_guests: { anonSelect: 'all', anonInsert: 'none', why: '+1 guests count toward the public roster' },
  event_payments: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true } },
  event_reminder_log: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only (server jobs)' },
  event_tags: { anonSelect: 'all', anonInsert: 'none', why: 'feed filters by tag for guests' },
  events: { anonSelect: 'all', anonInsert: 'none', owner: { column: 'created_by', ownRowsOnly: false, noInsertAsOther: true }, why: 'guest browsing' },
  external_sessions: { anonSelect: 'all', anonInsert: 'none', why: 'venue sessions in the guest feed (Schelagg ingest writes)' },
  external_programs: { anonSelect: 'all', anonInsert: 'none', why: 'outside leagues and tournaments in the guest feed (Schelagg programs ingest writes)' },
  feedback_submissions: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true } },
  friend_requests: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'requester_id', ownRowsOnly: true, noInsertAsOther: true }, why: 'only the two people on a pending request see it; written only by the friend RPCs' },
  friendships: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true }, why: 'one row per direction, each person reads only their own; written only by the friend RPCs' },
  major_cities: { anonSelect: 'all', anonInsert: 'none', why: 'reference list' },
  message_reactions: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true } },
  messages: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'sender_id', ownRowsOnly: false, noInsertAsOther: true } },
  notifications: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: false } },
  point_balances: { anonSelect: 'all', anonInsert: 'none', why: 'points show on public profiles' },
  point_events: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true } },
  profiles: { anonSelect: 'all', anonInsert: 'none', why: 'public profile columns (PROFILE_BRIEF_SELECT)' },
  push_receipts: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only (server jobs)' },
  push_tokens: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true } },
  rate_limits: { anonSelect: 'none', anonInsert: 'none', signedInSelect: 'none', why: 'service-only counters behind check_rate_limit (#102)' },
  sponsored_events: { anonSelect: 'some', anonInsert: 'none', why: 'guests see sponsorships inside their window; admins write' },
  tags: { anonSelect: 'all', anonInsert: 'none', why: 'reference list' },
  tournament_comments: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: false, noInsertAsOther: true } },
  tournament_matches: { anonSelect: 'none', anonInsert: 'none' },
  tournament_pool_teams: { anonSelect: 'none', anonInsert: 'none' },
  tournament_pools: { anonSelect: 'none', anonInsert: 'none' },
  tournament_prizes: { anonSelect: 'some', anonInsert: 'none', why: 'prizes of public (non-draft, non-club-only) tournaments' },
  tournament_rules: { anonSelect: 'some', anonInsert: 'none', why: 'rules of published tournaments' },
  tournament_sets: { anonSelect: 'none', anonInsert: 'none' },
  tournament_team_invitations: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'inviter_id', ownRowsOnly: false, noInsertAsOther: true } },
  tournament_team_join_requests: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'requester_id', ownRowsOnly: false, noInsertAsOther: true } },
  tournament_team_members: { anonSelect: 'none', anonInsert: 'none', insertRejectedBy: 'trigger' },
  tournament_teams: { anonSelect: 'none', anonInsert: 'none', insertRejectedBy: 'trigger' },
  tournament_trophies: { anonSelect: 'all', anonInsert: 'none', why: 'trophy cases on public profiles' },
  tournaments: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'created_by', ownRowsOnly: false, noInsertAsOther: true } },
  user_badges: { anonSelect: 'all', anonInsert: 'none', why: 'badges on public profiles' },
  user_event_templates: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true } },
  user_settings: { anonSelect: 'none', anonInsert: 'none', owner: { column: 'user_id', ownRowsOnly: true, noInsertAsOther: true } },
}
