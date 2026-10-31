/**
 * The screens the shot tool knows how to capture.
 *
 *   name: {
 *     route,       path to open (fixture ids from fixtures/index.mjs)
 *     signedIn,    capture with the fake session (default true)
 *     ready,       text that must be on screen before the shot (best effort; a miss is reported, not fatal)
 *     actions,     steps after load: { tap: testID, text? } (text: fallback when an older ref lacks the testID)
 *                  | { click: text } | { scroll: px } | { wait: ms }
 *     fullPage,    capture the whole scroll height instead of the viewport
 *     sources,     globs of source files that change this screen (affected.mjs)
 *   }
 *
 * Add a screen when you add a route; keep `sources` to the files specific to it.
 * Shared files (components/ui, theme, layouts) map to DEFAULT_SCREENS instead.
 */
import { IDS } from './fixtures/index.mjs'
import { P } from './fixtures/people.mjs'

const E = IDS.event
const T = IDS.tournament

const EVENT_DETAIL = [
  'app/(app)/event/**', 'components/event/**', 'hooks/event/**', 'components/EventCommentRow.tsx', 'components/DiscussionComposer.tsx',
  'components/VenmoPayButton.tsx', 'components/LinkedText.tsx',
]
const TOURNAMENT_DETAIL = ['app/(app)/tournament/[id].tsx', 'components/tournament/**', 'hooks/tournament/**', 'lib/tournament*.ts', 'constants/tournamentCopy.ts', 'types/tournament.ts']
// settings/index.tsx only bounces back (settings live under Profile), so it has no screen of its own.
const SETTINGS = ['app/(app)/(tabs)/settings/_layout.tsx', 'app/(app)/(tabs)/settings/index.tsx']

export const SCREENS = {
  // ── Events ──────────────────────────────────────────────────────────────
  'events-feed': {
    route: '/', ready: 'Lunchtime Pepper',
    sources: ['app/(app)/(tabs)/(main)/index.tsx', 'app/(app)/(tabs)/(main)/_layout.tsx', 'components/events/**', 'components/EventCard.tsx', 'components/ExternalSessionCard.tsx',
      'components/MyEventsRail.tsx', 'components/Pager.tsx', 'hooks/useMonthEvents.ts', 'hooks/useMyUpcomingEvents.ts', 'hooks/useTags.ts', 'utils/feed*.ts', 'utils/eventCardPreviews.ts',
      'utils/monthKeys.ts', 'utils/calendar*.ts', 'constants/events.ts', 'components/RefreshControl*.tsx', 'lib/pullGesture.ts'],
  },
  'events-feed-guest': {
    route: '/', signedIn: false, ready: 'Lunchtime Pepper',
    sources: ['app/(app)/(tabs)/(main)/index.tsx', 'components/events/**', 'components/EventCard.tsx', 'components/ExternalSessionCard.tsx', 'components/SignInButton.tsx', 'hooks/useMonthEvents.ts', 'utils/feed*.ts'],
  },
  'event-details': { route: `/event/${E.sundaySand}`, ready: 'Butler Park', sources: EVENT_DETAIL },
  'event-people': { route: `/event/${E.sundaySand}`, ready: 'Butler Park', actions: [{ tap: 'event-tab-people', text: 'People' }], sources: [...EVENT_DETAIL, 'components/ProfileAvatar.tsx'] },
  'event-discussion': { route: `/event/${E.sundaySand}`, ready: 'Butler Park', actions: [{ tap: 'event-tab-discussion', text: 'Discussion' }], sources: EVENT_DETAIL },
  'event-cheers': { route: `/event/${E.pastSand}`, ready: 'Butler Park', actions: [{ tap: 'event-tab-cheers', text: 'Cheers' }], sources: [...EVENT_DETAIL, 'components/CheerRadarChart.tsx'] },
  // Bottom of a paid event someone else hosts: price, Venmo button, about.
  'event-paid-bottom': { route: `/event/${E.fridayNight}`, ready: 'Austin Sports Center', actions: [{ scroll: 3000 }], sources: EVENT_DETAIL },
  'event-guest': { route: `/event/${E.fridayNight}`, signedIn: false, ready: 'Austin Sports Center', sources: EVENT_DETAIL },
  'host-create': { route: '/host', ready: 'Title', sources: ['app/(app)/host.tsx', 'components/host/**', 'components/DatePickerField*.tsx', 'components/LocationPickerField.tsx', 'components/Input.tsx'] },
  'host-edit': { route: `/host?edit=${E.sundaySand}`, sources: ['app/(app)/host.tsx', 'components/host/**'] },
  notifications: { route: '/notifications', ready: 'Running 10 minutes late', sources: ['app/(app)/notifications.tsx', 'hooks/useNotifications.ts', 'components/NotificationPopup.tsx'] },

  // ── Clubs ───────────────────────────────────────────────────────────────
  'clubs-list': { route: '/clubs', ready: 'Eastside Sand Social', sources: ['app/(app)/(tabs)/clubs.tsx', 'components/MajorCityAutocomplete.tsx'] },
  'club-detail': { route: `/club/${IDS.club.eastside}`, ready: 'Eastside Sand Social', sources: ['app/(app)/club/[id].tsx', 'hooks/useClub.ts', 'components/ClubPostCard.tsx', 'components/EventCard.tsx'] },
  'club-detail-guest': { route: `/club/${IDS.club.indoor}`, signedIn: false, ready: 'Austin Indoor League', sources: ['app/(app)/club/[id].tsx', 'hooks/useClub.ts'] },
  'club-create': { route: '/club/create', sources: ['app/(app)/club/create.tsx'] },

  // ── Chat ────────────────────────────────────────────────────────────────
  'chat-list': { route: '/chat', ready: 'Jordan', sources: ['app/(app)/(tabs)/chat.tsx', 'hooks/useConversations.ts', 'hooks/useChatUnread.tsx', 'hooks/useOpenDm.ts'] },
  'chat-conversation': {
    route: `/chat/${IDS.conversation.jordan}`, ready: 'Bringing the good ball',
    sources: ['app/(app)/chat/**', 'components/ChatMessageList*.tsx', 'components/MessageBubble.tsx', 'components/ReactionPicker.tsx', 'hooks/useMessages.ts', 'hooks/useSilencedUsers.ts'],
  },
  'chat-club': { route: `/chat/${IDS.conversation.clubChat}`, ready: 'shared album', sources: ['app/(app)/chat/**', 'components/ChatMessageList*.tsx', 'components/MessageBubble.tsx'] },

  // ── Profile ─────────────────────────────────────────────────────────────
  'profile-own': {
    route: '/profile', ready: 'Maya',
    sources: ['app/(app)/(tabs)/(main)/profile/**', 'components/profile/**', 'components/ProfileAvatar.tsx', 'components/BadgeIcon.tsx', 'hooks/useMyProfile.ts', 'hooks/useBadges.ts', 'constants/badges.ts'],
  },
  'profile-own-guest': { route: '/profile', signedIn: false, sources: ['app/(app)/(tabs)/(main)/profile/**', 'components/SignInPrompt.tsx'] },
  'profile-other': {
    route: `/profile/${P.jordanr}`, ready: 'Jordan',
    sources: ['app/(app)/profile/**', 'app/(app)/(tabs)/profile/**', 'components/profile/**', 'components/ProfileAvatar.tsx', 'components/BadgeIcon.tsx', 'constants/badges.ts'],
  },

  // ── Settings ────────────────────────────────────────────────────────────
  'settings-account': { route: '/settings/account', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/account.tsx'] },
  'settings-display': { route: '/settings/display', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/display.tsx', 'contexts/textScale.tsx'] },
  'settings-notifications': {
    route: '/settings/notifications', ready: 'Reminders',
    sources: [...SETTINGS, 'app/(app)/(tabs)/settings/notifications.tsx', 'constants/notifications.ts', 'utils/notificationPrefs.ts', 'utils/reminders.ts', 'hooks/useUserSettings.ts'],
  },
  'settings-history': { route: '/settings/history', ready: 'Halloween Warm-up', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/history.tsx'] },
  'settings-hosted': { route: '/settings/hosted', ready: 'Sand Doubles at Butler', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/hosted.tsx'] },
  'settings-cheers': { route: '/settings/cheers', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/cheers.tsx', 'components/CheerRadarChart.tsx'] },
  'settings-badges': { route: '/settings/badges', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/badges.tsx', 'components/BadgeIcon.tsx', 'constants/badges.ts', 'hooks/useBadges.ts'] },
  'settings-feedback': { route: '/settings/feedback', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/feedback.tsx'] },
  'settings-silenced': { route: '/settings/silenced', ready: 'Hannah', sources: [...SETTINGS, 'app/(app)/(tabs)/settings/silenced.tsx', 'hooks/useSilencedUsers.ts'] },

  // ── Tournaments ─────────────────────────────────────────────────────────
  'tournaments-list': { route: '/tournaments', ready: 'Halloween Sand Classic', sources: ['app/(app)/tournaments.tsx', 'hooks/useTournamentList.ts', 'utils/tournamentList.ts', 'components/events/AllTournamentsLink.tsx'] },
  'tournaments-list-past': { route: '/tournaments', ready: 'Halloween Sand Classic', actions: [{ tap: 'tournaments-past' }], sources: ['app/(app)/tournaments.tsx', 'hooks/useTournamentList.ts', 'utils/tournamentList.ts'] },
  'tournament-overview': { route: `/tournament/${T.upcoming}`, ready: 'Halloween Sand Classic', sources: TOURNAMENT_DETAIL },
  'tournament-teams': { route: `/tournament/${T.upcoming}`, ready: 'Halloween Sand Classic', actions: [{ tap: 'tournament-tab-teams', text: 'Teams' }], sources: TOURNAMENT_DETAIL },
  'tournament-schedule': { route: `/tournament/${T.upcoming}`, ready: 'Halloween Sand Classic', actions: [{ tap: 'tournament-tab-schedule', text: 'Schedule' }], sources: TOURNAMENT_DETAIL },
  'tournament-results': { route: `/tournament/${T.past}`, ready: 'Fall Doubles Cup', actions: [{ tap: 'tournament-tab-results', text: 'Results' }], sources: TOURNAMENT_DETAIL },
  'tournament-discussion': { route: `/tournament/${T.upcoming}`, ready: 'Halloween Sand Classic', actions: [{ tap: 'tournament-tab-discussion', text: 'Discussion' }], sources: TOURNAMENT_DETAIL },
  'tournament-create': { route: '/tournament/create', sources: ['app/(app)/tournament/create.tsx'] },

  // ── Auth and legal (signed out) ─────────────────────────────────────────
  login: { route: '/login', signedIn: false, sources: ['app/(auth)/login.tsx', 'app/(auth)/_layout.tsx', 'components/legal/**', 'components/GoogleLogo.tsx', 'components/Input.tsx', 'components/Button.tsx'] },
  register: { route: '/register', signedIn: false, sources: ['app/(auth)/register.tsx', 'app/(auth)/_layout.tsx', 'components/legal/**', 'components/Input.tsx'] },
  'reset-password': { route: '/reset-password', signedIn: false, sources: ['app/(auth)/reset-password.tsx', 'app/(auth)/_layout.tsx'] },
  terms: { route: '/terms', signedIn: false, sources: ['app/terms.tsx', 'components/legal/**', 'constants/legal.ts', 'utils/legalMarkdown.ts'] },
  privacy: { route: '/privacy', signedIn: false, sources: ['app/privacy.tsx', 'components/legal/**', 'constants/legal.ts', 'utils/legalMarkdown.ts'] },
}

/** Shown when a shared file changes (or a frontend file no screen claims). */
export const DEFAULT_SCREENS = ['events-feed', 'event-details', 'clubs-list', 'chat-conversation', 'profile-own', 'tournament-overview', 'settings-notifications', 'login']

/** Files that affect every screen: a change here means DEFAULT_SCREENS. */
export const SHARED_SOURCES = [
  'components/ui/**', 'components/Button.tsx', 'components/Input.tsx', 'components/Toast.tsx', 'components/tour/**', 'components/WebStackContentTransition.tsx', 'components/DocScrollView.tsx',
  'constants/theme.ts', 'constants/styles.ts', 'constants/navigation.ts', 'constants/layout.ts', 'constants/copy.ts', 'constants/index.ts', 'constants/banners.ts', 'constants/tours.ts',
  'app/_layout.tsx', 'app/+html.tsx', 'app/(app)/_layout.tsx', 'app/(app)/(tabs)/_layout.tsx', 'contexts/**', 'lib/**', 'utils/index.ts', 'utils/routes.ts', 'utils/authGate.ts',
  'assets/**', 'app.json', 'babel.config.js', 'metro.config.js', 'package.json', 'package-lock.json', 'public/**',
]

/** Files that never change what a screen looks like. */
export const IGNORED_SOURCES = [
  '__tests__/**', 'e2e/**', 'docs/**', 'scripts/**', 'supabase/**', '.github/**', 'api/**', '**/*.md', 'types/database.ts', 'playwright.config.ts', 'jest.setup.js',
  'eas.json', 'vercel.json', '.env*', '.gitignore', 'tsconfig.json', '**/*.test.*',
]
