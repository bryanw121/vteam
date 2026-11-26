import { memo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme, SURFACE_ACCENTS, SURFACE_LABELS } from '../constants'
import { TimePill } from './ui'
import type { ExternalSession, SessionLinkDecision, SessionLinkNotice } from '../types'
import { formatSessionTimeRange, signupHost } from '../utils/feedItems'
import { describeNewTime } from '../lib/schelagg'
import { useOutsideSessionLink } from '../hooks/useOutsideSessionLink'
import { useToday } from '../hooks/useToday'
import { sessionConfirmation } from '../utils/externalFreshness'
import { ConfirmDialog } from './ui'
import { Spinner } from './ui/Spinner'
import { OUTSIDE_SESSION_COPY } from '../constants/copy'
import { OutsideShareButton } from './OutsideShareButton'
import { routes } from '../utils/routes'
import { sessionShareText } from '../utils/outsideShare'

type Props = {
  session: ExternalSession
  /** Leave room top-right for the feed's ⋯ button (`FeedItemShell`). */
  menuInset?: boolean
  /** Leave out the date block: the desktop feed's day header already says the day. */
  hideDate?: boolean
  /**
   * Open the session's sheet (#348) instead of the venue's page. The feed and search pass it;
   * without it a tap still goes straight to the sign-up link (with the venue check).
   */
  onOpen?: (session: ExternalSession) => void
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']



/** Dialog copy for a check result (or a blocked tab). `host` is the sign-up site, e.g. "reclub.co". */
function noticeCopy(notice: SessionLinkNotice, host: string) {
  switch (notice.kind) {
    case 'canceled':
      return {
        title: 'Cancelled at the venue',
        body: `${host} shows this session as cancelled. Check their page before you go.`,
        confirm: 'Open venue page anyway',
        cancel: 'Close',
      }
    case 'gone':
      return {
        title: 'No longer listed at the venue',
        body: `${host} doesn't list this session any more. It may have been cancelled or moved.`,
        confirm: 'Open venue page anyway',
        cancel: 'Close',
      }
    case 'changed': {
      const when = describeNewTime(notice.startsAt, notice.endsAt)
      const details = notice.changes.length ? ` Changed: ${notice.changes.join(', ')}.` : ''
      return {
        title: when ? 'The time changed' : 'Details changed at the venue',
        body: `${when ? `Now ${when}.` : 'The venue updated this session.'}${details}`,
        confirm: `Continue to ${host}`,
        cancel: 'Not now',
      }
    }
    case 'blocked':
      return {
        title: `Open ${host}?`,
        body: 'Your browser blocked the new tab.',
        confirm: 'Open',
        cancel: 'Cancel',
      }
  }
}

/** One line on the card once a check found something. */
function findingLabel(finding: Exclude<SessionLinkDecision, { action: 'open' }>): string {
  if (finding.kind !== 'changed') return finding.kind === 'canceled' ? 'Cancelled at the venue' : 'No longer listed at the venue'
  const when = describeNewTime(finding.startsAt, finding.endsAt)
  return when ? `New time: ${when}` : 'Details changed at the venue'
}

/**
 * A session another Austin venue or group runs (synced by Schelagg). Not a
 * vteam event: nobody RSVPs here. With `onOpen` (the feed, search) the card
 * shows the venue's note and opens the session sheet (#348), whose button
 * leaves for the sign-up page; without it the whole card links out. Dashed
 * border keeps it visibly distinct from club events. Before opening,
 * useOutsideSessionLink asks Schelagg whether the venue still lists it
 * (≤1.5s), and asks first if it was cancelled, moved or dropped.
 */
function ExternalSessionCardInner({ session, menuInset = false, hideDate = false, onOpen }: Props) {
  const start = new Date(session.starts_at)
  const surface = session.surface ? { label: SURFACE_LABELS[session.surface], color: SURFACE_ACCENTS[session.surface] } : null
  const accent = surface?.color ?? theme.colors.subtext
  const timeRange = formatSessionTimeRange(session.starts_at, session.ends_at)
  const meta = [session.level, session.price]
    .filter(Boolean)
    .join(' · ')
  const directLabel = session.signup_label ?? (session.signup_url ? `Sign up on ${signupHost(session.signup_url)}` : null)
  const signupLabel = onOpen ? OUTSIDE_SESSION_COPY.cardAction : directLabel
  const note = session.note?.trim() || null

  const host = session.signup_url ? signupHost(session.signup_url) : 'the venue'
  const link = useOutsideSessionLink(session)
  const copy = link.notice ? noticeCopy(link.notice, host) : null
  const finding = link.finding ? findingLabel(link.finding) : null
  // Not confirmed at the source lately (Schelagg kept its last good copy): say so before anyone drives out.
  const confirmation = sessionConfirmation(session, useToday())

  return (
    <View>
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => (onOpen ? onOpen(session) : void link.open())}
      disabled={onOpen ? false : !session.signup_url || link.checking}
      style={shared.externalCard}
      accessibilityRole={onOpen ? 'button' : 'link'}
      accessibilityState={{ busy: link.checking }}
      accessibilityLabel={`${session.title} at ${session.venue}. ${finding ? `${finding}. ` : confirmation.note ? `${confirmation.note}. ` : ''}${onOpen && note ? `${note} ` : ''}${signupLabel ?? ''}`}
      testID="external-session-card"
    >
      {!hideDate && <View style={[shared.externalDateBlock, { backgroundColor: accent + '22' }]}>
        <Text style={[shared.externalDay, { color: accent }]}>{DAYS[start.getDay()]}</Text>
        <Text style={[shared.externalDate, { color: accent }]}>{start.getDate()}</Text>
      </View>}

      <View style={shared.externalBody}>
        <Text style={[shared.externalKicker, menuInset && { paddingRight: 36 }]} numberOfLines={1}>
          {[surface?.label, session.session_type].filter(Boolean).join(' · ')}
        </Text>
        <View style={{ marginBottom: 4 }}>
          <TimePill label={timeRange} accessibilityLabel={timeRange} testID="external-session-time" />
        </View>
        <Text style={shared.externalTitle} numberOfLines={2}>{session.title}</Text>
        <Text style={shared.externalMeta} numberOfLines={1}>
          {session.city ? `${session.venue} · ${session.city}` : session.venue}
        </Text>
        {meta ? <Text style={shared.externalMeta} numberOfLines={1}>{meta}</Text> : null}
        {/* The venue's own note ("courts not guaranteed", "call first"), #348. */}
        {onOpen && note ? <Text style={shared.externalNote} numberOfLines={2} testID="external-session-note">{note}</Text> : null}
        {!finding && confirmation.note ? (
          <Text style={shared.externalFinding} numberOfLines={2} testID="external-session-unconfirmed">{confirmation.note}</Text>
        ) : null}
        {finding ? (
          <Text
            style={[shared.externalFinding, link.finding?.kind !== 'changed' && shared.externalFindingCanceled]}
            numberOfLines={2}
            testID="external-session-finding"
          >
            {finding}
          </Text>
        ) : null}
        {signupLabel && (
          <View style={shared.externalSignup}>
            <Text style={shared.externalSignupLabel}>{link.checking ? 'Checking with the venue…' : signupLabel}</Text>
            {link.checking
              ? <Spinner size="small" color={theme.colors.text} testID="external-session-checking" />
              : <Ionicons name={onOpen ? 'chevron-forward' : 'open-outline'} size={13} color={theme.colors.text} />}
          </View>
        )}
      </View>
    </TouchableOpacity>
    {/* Share without opening it first (#395): a sibling of the card's button, over its corner. */}
    <OutsideShareButton
      path={routes.events({ session: session.id })}
      title={`${session.title} at ${session.venue}`}
      text={sessionShareText(session)}
      screen="outside_session_card"
      testID="external-session-share"
    />
    {copy ? (
      <ConfirmDialog
        visible
        title={copy.title}
        body={copy.body}
        confirmLabel={copy.confirm}
        cancelLabel={copy.cancel}
        onConfirm={link.openAnyway}
        onCancel={link.dismiss}
      />
    ) : null}
    </View>
  )
}

export const ExternalSessionCard = memo(ExternalSessionCardInner)
