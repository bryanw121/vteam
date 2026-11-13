/**
 * Usage-metric event names (lib/analytics `track`). Rows land in the
 * `app_events` table; names must be short snake_case (the table checks it).
 * Props stay small: ids, a step index, a source.
 */
export const ANALYTICS_EVENTS = {
  /** A one-time banner appeared. props: { banner } */
  bannerShown: 'banner_shown',
  /** Its action link was tapped. props: { banner, action } */
  bannerAction: 'banner_action',
  /** Its close button was tapped. props: { banner } */
  bannerDismissed: 'banner_dismissed',
  /** props: { tour, source } */
  tourStarted: 'tour_started',
  /** A step was shown. props: { tour, step (0-based index), target } */
  tourStepViewed: 'tour_step_viewed',
  /** Done on the last step (or no further step could be shown). props: { tour, step } */
  tourCompleted: 'tour_completed',
  /** Skip / Esc. props: { tour, step, target } (the step it was on) */
  tourSkipped: 'tour_skipped',
  /** A tour step was skipped because its target wasn't on screen (a screen hid it). props: { tour, step, target }. Should never happen; also a Sentry warning. */
  tourStepMissing: 'tour_step_missing',
  /** The leave sheet opened on an event the viewer attends (#171). props: { full, within24h, paid } */
  leaveSheetShown: 'leave_sheet_shown',
  /** "Leave game" tapped. props: { reason } (a LEAVE_REASONS id, or 'none') */
  leaveConfirmed: 'leave_confirmed',
  /** Stay in / Esc / back / scrim. */
  leaveCancelled: 'leave_cancelled',
  /** Player setup (#156) opened after sign-in. */
  playerSetupShown: 'player_setup_shown',
  /** Next on a step. props: { step: 'position' | 'level' | 'city' } */
  playerSetupStepDone: 'player_setup_step_done',
  /** Skip. props: { step } (the step it was on) */
  playerSetupSkipped: 'player_setup_skipped',
  /** Done on the last step. */
  playerSetupCompleted: 'player_setup_completed',
  /** The Events feed's first rows were in hand (#184). props: { ms (since navigation start), source: snapshot | prefetch | fetch, cold } */
  feedFirstPaint: 'feed_first_paint',
  /** A guest tapped Join / Join waitlist / Request and was sent to sign up (#229). props: { action } */
  joinIntentSaved: 'join_intent_saved',
  /** Back on the game after signing in. props: { outcome: joined | not_now | skipped | expired, offer? } */
  joinIntentResumed: 'join_intent_resumed',
  /** A session opened: launch, back after 30 min away, or a different account signed in. props: { cold, referrer? (web, cold only: direct | internal | search | link) } */
  sessionStart: 'session_start',
  /** The screen type changed. props: { screen (route pattern, e.g. /event/[id], or a tab's path), from? } */
  screenView: 'screen_view',
  /** Tapped through to a sign-up or booking page run outside vteam (Schelagg data). props: { kind: session | league | tournament | court, org (venue or organizer name, never a URL) } */
  outsideLinkOpened: 'outside_link_opened',
  /** Shared an event. props: { surface: 'event', method: share_sheet | web_share | copy_link } */
  shareTapped: 'share_tapped',
  /** Changed the Events feed filters (not the restore on open). props: { filter, surface } */
  feedFilterChanged: 'feed_filter_changed',
  /** A Scorekeeper match started or finished (device-only, so this is the only record). props: { stage: started | finished, sets (sets played) } */
  scorekeeperMatch: 'scorekeeper_match',
  /** A Share button sent or copied a screen's link. props: { screen (tournament, tournaments, leagues, events, profile), how: share | copy, filtered } */
  linkShared: 'link_shared',
  /** A player was reported (#243): { kind, reason }, never ids. */
  reportSent: 'report_sent',
  /** Said they'll bring something to a game (#256). props: { surface (indoor | sand | grass | unknown), required } */
  bringItemClaimed: 'bring_item_claimed',
  /** Opened a new game alert (#170) from the inbox or a push. props: { source: club | host | unknown (pushes don't say), via: inbox | push } */
  gameAlertOpened: 'game_alert_opened',
  /** Changed New game alerts settings (#170). props: { field: clubs | hosts | surfaces | levels | times | club } */
  gameAlertsChanged: 'game_alerts_changed',
  /** Let go of something they said they'd bring. props: { surface } */
  bringItemReleased: 'bring_item_released',
  /** A host saved a game's "What to bring" list. props: { items (count), surface } */
  bringListSaved: 'bring_list_saved',
} as const
