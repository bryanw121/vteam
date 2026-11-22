import { View, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { BottomSheet, Chip, ConfirmDialog, TimePill } from '../ui'
import { Button } from '../Button'
import { ShareLinkButton } from '../ShareLinkButton'
import { shared, theme, SURFACE_LABELS } from '../../constants'
import { OUTSIDE_SESSION_COPY } from '../../constants/copy'
import { routes } from '../../utils/routes'
import { formatDate } from '../../utils/dateFormat'
import { formatSessionTimeRange, signupHost } from '../../utils/feedItems'
import { directionsQuery, listedLine, signupButtonLabel } from '../../utils/outsideSession'
import { sessionConfirmation } from '../../utils/externalFreshness'
import { describeNewTime } from '../../lib/schelagg'
import { openInMaps } from '../../lib/openInMaps'
import { useOutsideSessionLink } from '../../hooks/useOutsideSessionLink'
import { useToday } from '../../hooks/useToday'
import type { ExternalSession, IoniconName, OutsideSessionSheetProps, SessionLinkNotice } from '../../types'

/** The venue-check dialog's copy, as on the card (the sheet's button runs the same check). */
function noticeCopy(notice: SessionLinkNotice, host: string) {
  switch (notice.kind) {
    case 'canceled':
      return { title: 'Cancelled at the venue', body: `${host} shows this session as cancelled. Check their page before you go.`, confirm: 'Open venue page anyway', cancel: 'Close' }
    case 'gone':
      return { title: 'No longer listed at the venue', body: `${host} doesn't list this session any more. It may have been cancelled or moved.`, confirm: 'Open venue page anyway', cancel: 'Close' }
    case 'changed': {
      const when = describeNewTime(notice.startsAt, notice.endsAt)
      const details = notice.changes.length ? ` Changed: ${notice.changes.join(', ')}.` : ''
      return { title: when ? 'The time changed' : 'Details changed at the venue', body: `${when ? `Now ${when}.` : 'The venue updated this session.'}${details}`, confirm: `Continue to ${host}`, cancel: 'Not now' }
    }
    case 'blocked':
      return { title: `Open ${host}?`, body: 'Your browser blocked the new tab.', confirm: 'Open', cancel: 'Cancel' }
  }
}

function Row({ icon, iconColor, main, sub, mainColor, children, testID }: {
  icon: IoniconName; iconColor?: string; main: string; sub?: string | null; mainColor?: string; children?: React.ReactNode; testID?: string
}) {
  return (
    <View style={shared.sessionSheetRow} testID={testID}>
      <Ionicons name={icon} size={18} color={iconColor ?? theme.colors.primaryText} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[shared.sessionSheetRowMain, mainColor ? { color: mainColor } : null]}>{main}</Text>
        {sub ? <Text style={shared.sessionSheetRowSub}>{sub}</Text> : null}
        {children}
      </View>
    </View>
  )
}

const dateLabel = (iso: string) => formatDate(new Date(iso), { weekday: 'short', month: 'short', day: 'numeric' })

/** The sheet's body for one session; keyed by id, so the venue check starts fresh per session. */
function SessionDetails({ session, alsoOn, onPickOther, onHide }: {
  session: ExternalSession
  alsoOn: ExternalSession[]
  onPickOther: (s: ExternalSession) => void
  onHide?: () => void
}) {
  const today = useToday()
  const link = useOutsideSessionLink(session, 'sheet')
  const host = session.signup_url ? signupHost(session.signup_url) : 'the venue'
  const copy = link.notice ? noticeCopy(link.notice, host) : null
  const finding = link.finding
    ? link.finding.kind === 'changed'
      ? (describeNewTime(link.finding.startsAt, link.finding.endsAt) ? `New time: ${describeNewTime(link.finding.startsAt, link.finding.endsAt)}` : 'Details changed at the venue')
      : link.finding.kind === 'canceled' ? 'Cancelled at the venue' : 'No longer listed at the venue'
    : null
  const confirmation = sessionConfirmation(session, today)
  const kicker = [session.surface ? SURFACE_LABELS[session.surface] : null, session.session_type, OUTSIDE_SESSION_COPY.notOnVteam].filter(Boolean).join(' · ')
  const when = `${dateLabel(session.starts_at)} · ${formatSessionTimeRange(session.starts_at, session.ends_at)}`
  const place = directionsQuery(session)
  const signup = signupButtonLabel(session)
  const note = session.note?.trim() || null

  return (
    <View testID="outside-session-sheet">
      <Text style={shared.sessionSheetKicker}>{kicker}</Text>
      <Text style={shared.sessionSheetTitle} accessibilityRole="header">{session.title}</Text>
      <View style={{ alignSelf: 'flex-start', marginBottom: theme.spacing.xs }}>
        <TimePill label={when} accessibilityLabel={when} />
      </View>
      {finding ? (
        <Text
          style={[shared.externalFinding, link.finding?.kind !== 'changed' && shared.externalFindingCanceled]}
          testID="external-session-finding"
        >
          {finding}
        </Text>
      ) : null}
      {place ? (
        <Row icon="location-outline" main={session.venue} sub={session.city}>
          <TouchableOpacity
            onPress={() => openInMaps(place)}
            accessibilityRole="link"
            accessibilityLabel={`${OUTSIDE_SESSION_COPY.directions} to ${place}`}
            style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}
            testID="outside-session-directions"
          >
            <Text style={shared.sessionSheetLink}>{OUTSIDE_SESSION_COPY.directions} ↗</Text>
          </TouchableOpacity>
        </Row>
      ) : null}
      {session.price || session.level ? (
        <Row icon="pricetag-outline" main={session.price ?? session.level ?? ''} sub={session.price ? session.level : null} />
      ) : null}
      {note ? (
        <Row icon="information-circle-outline" main={note} testID="outside-session-note" />
      ) : null}
      {confirmation.note ? (
        <Row icon="alert-circle-outline" iconColor={theme.colors.warning} main={confirmation.note} mainColor={theme.colors.warning} />
      ) : null}
      {alsoOn.length ? (
        <Row icon="repeat-outline" main={OUTSIDE_SESSION_COPY.alsoOn}>
          <View style={shared.sessionSheetDates}>
            {alsoOn.map(s => (
              <Chip key={s.id} label={dateLabel(s.starts_at)} onPress={() => onPickOther(s)} variant="tint" testID="outside-session-also-on" />
            ))}
          </View>
        </Row>
      ) : null}
      {signup ? (
        <Button
          label={link.checking ? 'Checking with the venue…' : `${signup} ↗`}
          onPress={() => void link.open()}
          loading={link.checking}
          style={{ marginTop: theme.spacing.md }}
          accessibilityLabel={`${signup}, opens ${host}`}
          testID="outside-session-signup"
        />
      ) : null}
      <View style={shared.sessionSheetActions}>
        <ShareLinkButton
          path={routes.events({ session: session.id })}
          title={`${session.title} at ${session.venue}`}
          screen="outside_session"
          testID="outside-session-share"
        />
        {onHide ? (
          <Button label={OUTSIDE_SESSION_COPY.hide} variant="secondary" icon="eye-off-outline" onPress={onHide} fullWidth={false} size="touch" testID="outside-session-hide" />
        ) : null}
      </View>
      <Text style={shared.sessionSheetFooter}>{listedLine(session, today)}</Text>
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

/**
 * An outside session's details (#348): when and where (with directions), price and level, the
 * venue's note, the other dates it runs, the sign-up button (which runs the venue check), Share
 * and Hide. Opened from its card in the feed or search, or from a `/?session=<id>` link.
 */
export function OutsideSessionSheet({ session, alsoOn, onPickOther, onDismiss, onHide, onClosed }: OutsideSessionSheetProps) {
  return (
    <BottomSheet visible={!!session} onDismiss={onDismiss} onClosed={onClosed} accessibilityLabel={session?.title} maxWidth={560}>
      {session ? (
        <SessionDetails key={session.id} session={session} alsoOn={alsoOn} onPickOther={onPickOther} onHide={onHide} />
      ) : null}
    </BottomSheet>
  )
}
