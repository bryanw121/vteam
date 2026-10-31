import React, { useState, useRef, useCallback, useMemo } from 'react'
import { Platform, View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Text } from '../ui/Text'
import { RefreshControl } from '../RefreshControl'
import { GestureDetector, Gesture, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from '../Button'
import { ProfileAvatar } from '../ProfileAvatar'
import { DocScrollView } from '../DocScrollView'
import { IconButton } from '../ui'
import { RosterActionsSheet } from './RosterActionsSheet'
import { shared, theme, TEAM_COLORS, TEAM_COLOR_NAMES } from '../../constants'
import type { EventWithDetails, Profile, AttendanceStatus, EventGuest, RosterAction, RosterActionContext, RosterMenu } from '../../types'
import { profileDisplayName, profileAvatarSmallUri, hostRosterSkillAndPositionsLine } from '../../utils'
import { guestRowActions, hasRosterMenu, memberRowActions } from '../../utils/rosterActions'
import { attendeesPaid } from '../../hooks/event/derive'
import type { EventAttendanceApi, EventData, EventPaymentsApi, EventTeamsApi, TeamDragApi } from '../../types'

// ─── Draggable cards (People tab only) ───────────────────────────────────────

type DraggableCardProps = {
  profile: Profile
  teamColor: string | null
  isPinned: boolean
  isOwner: boolean
  onDragStart: (x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onRemove: () => void
  onTogglePin: () => void
  /**
   * When set, the corner control is a ⋯ menu (Message / View profile / Remove)
   * instead of the bare ✕, so Remove lives inside it rather than competing with it.
   */
  onOpenMenu?: () => void
  /** Hosts on a paid event: whether this player marked "I've paid". Undefined hides the badge. */
  paid?: boolean
}

function DraggablePlayerCard({ profile, teamColor, isPinned, isOwner, onDragStart, onDragMove, onDragEnd, onRemove, onTogglePin, onOpenMenu, paid }: DraggableCardProps) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const avatarUri = profileAvatarSmallUri(profile.avatar_url)

  // Stable wrappers so the gesture closure never captures stale callbacks
  const cbRef = useRef({ onDragStart, onDragMove, onDragEnd, onTogglePin })
  cbRef.current = { onDragStart, onDragMove, onDragEnd, onTogglePin }
  const stableStart     = useCallback((x: number, y: number) => cbRef.current.onDragStart(x, y), [])
  const stableMove      = useCallback((x: number, y: number) => cbRef.current.onDragMove(x, y), [])
  const stableEnd       = useCallback((x: number, y: number) => cbRef.current.onDragEnd(x, y), [])
  const stableCancel    = useCallback(() => cbRef.current.onDragEnd(-1, -1), [])
  const stableTogglePin = useCallback(() => cbRef.current.onTogglePin(), [])

  const panGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onStart((e) => {
        'worklet'
        scale.value = withSpring(1.06, { damping: 12 })
        opacity.value = withSpring(0.35)
        runOnJS(stableStart)(e.absoluteX, e.absoluteY)
      })
      .onUpdate((e) => {
        'worklet'
        runOnJS(stableMove)(e.absoluteX, e.absoluteY)
      })
      .onEnd((e) => {
        'worklet'
        scale.value = withSpring(1)
        opacity.value = withSpring(1)
        runOnJS(stableEnd)(e.absoluteX, e.absoluteY)
      })
      .onFinalize((_e, success) => {
        'worklet'
        scale.value = withSpring(1)
        opacity.value = withSpring(1)
        if (!success) runOnJS(stableCancel)()
      })
      .enabled(isOwner)

    // Web: activate on click-drag (standard mouse UX)
    // Mobile: require a long press first so normal scrolling isn't broken
    return Platform.OS === 'web' ? pan.minDistance(5) : pan.activateAfterLongPress(500)
  }, [isOwner])

  const tapGesture = useMemo(() => Gesture.Tap()
    .onEnd(() => { 'worklet'; runOnJS(stableTogglePin)() })
    .enabled(isOwner),
  [isOwner])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  // X stays outside the pan gesture so taps work; shell keeps the original single-card look.
  return (
    <View style={shared.playerCardShell}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1, minWidth: 0 }, animStyle]}>
          <GestureDetector gesture={tapGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <ProfileAvatar uri={avatarUri} border={profile.selected_border ?? null} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={shared.playerCardName} numberOfLines={1}>{profileDisplayName(profile)}</Text>
                {isOwner ? (
                  <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 1 }} numberOfLines={2}>
                    {hostRosterSkillAndPositionsLine(profile)}
                  </Text>
                ) : null}
                {paid && (
                  <View testID="roster-paid-badge" accessibilityLabel="Marked paid" style={styles.paidBadge}>
                    <Ionicons name="checkmark" size={11} color={theme.colors.success} />
                    <Text style={styles.paidBadgeText}>Paid</Text>
                  </View>
                )}
              </View>
              {isOwner && isPinned && teamColor && (
                <Ionicons name="lock-closed" size={13} color={theme.colors.subtext} />
              )}
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      <CardCornerControl
        onOpenMenu={onOpenMenu}
        onRemove={isOwner ? onRemove : undefined}
        menuLabel={`Actions for ${profileDisplayName(profile)}`}
        removeLabel={`Remove ${profileDisplayName(profile)}`}
      />
    </View>
  )
}

type DraggableGuestCardProps = {
  guest: EventGuest
  adderUsername: string
  teamColor: string | null
  isPinned: boolean
  isOwner: boolean
  onDragStart: (x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onRemove: () => void
  onTogglePin: () => void
  onOpenMenu?: () => void
}

function DraggableGuestCard({ guest, adderUsername, teamColor, isPinned, isOwner, onDragStart, onDragMove, onDragEnd, onRemove, onTogglePin, onOpenMenu }: DraggableGuestCardProps) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  const cbRef = useRef({ onDragStart, onDragMove, onDragEnd, onTogglePin })
  cbRef.current = { onDragStart, onDragMove, onDragEnd, onTogglePin }
  const stableStart     = useCallback((x: number, y: number) => cbRef.current.onDragStart(x, y), [])
  const stableMove      = useCallback((x: number, y: number) => cbRef.current.onDragMove(x, y), [])
  const stableEnd       = useCallback((x: number, y: number) => cbRef.current.onDragEnd(x, y), [])
  const stableCancel    = useCallback(() => cbRef.current.onDragEnd(-1, -1), [])
  const stableTogglePin = useCallback(() => cbRef.current.onTogglePin(), [])

  const panGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onStart((e) => { 'worklet'; scale.value = withSpring(1.06, { damping: 12 }); opacity.value = withSpring(0.35); runOnJS(stableStart)(e.absoluteX, e.absoluteY) })
      .onUpdate((e) => { 'worklet'; runOnJS(stableMove)(e.absoluteX, e.absoluteY) })
      .onEnd((e) => { 'worklet'; scale.value = withSpring(1); opacity.value = withSpring(1); runOnJS(stableEnd)(e.absoluteX, e.absoluteY) })
      .onFinalize((_e, success) => { 'worklet'; scale.value = withSpring(1); opacity.value = withSpring(1); if (!success) runOnJS(stableCancel)() })
      .enabled(isOwner)
    return Platform.OS === 'web' ? pan.minDistance(5) : pan.activateAfterLongPress(500)
  }, [isOwner])

  const tapGesture = useMemo(() => Gesture.Tap()
    .onEnd(() => { 'worklet'; runOnJS(stableTogglePin)() })
    .enabled(isOwner),
  [isOwner])

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }))
  const initials = guest.first_name.charAt(0).toUpperCase() + guest.last_name.charAt(0).toUpperCase()

  return (
    <View style={shared.playerCardShell}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1, minWidth: 0 }, animStyle]}>
          <GestureDetector gesture={tapGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={[shared.playerCardAvatar, { borderColor: teamColor ?? theme.colors.border, backgroundColor: teamColor ? teamColor + '18' : theme.colors.background, borderWidth: teamColor ? 2 : 1.5 }]}>
                <Text style={[shared.playerCardAvatarInitial, { color: teamColor ?? theme.colors.subtext }]}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={shared.playerCardName} numberOfLines={1}>{guest.first_name} {guest.last_name.charAt(0)}.</Text>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, lineHeight: 14 }} numberOfLines={1}>{adderUsername}'s +1</Text>
              </View>
              {isOwner && isPinned && teamColor && (
                <Ionicons name="lock-closed" size={13} color={theme.colors.subtext} />
              )}
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      <CardCornerControl
        onOpenMenu={onOpenMenu}
        onRemove={isOwner ? onRemove : undefined}
        menuLabel={`Actions for guest ${guest.first_name} ${guest.last_name}`}
        removeLabel={`Remove guest ${guest.first_name} ${guest.last_name}`}
      />
    </View>
  )
}

type CardCornerControlProps = {
  onOpenMenu?: () => void
  onRemove?: () => void
  menuLabel: string
  removeLabel: string
}

/**
 * A roster card's single corner control: ⋯ when the row has a menu, else the
 * host's bare ✕, else nothing. It sits outside the card's pan/tap gestures so
 * presses register; web uses a responder View (a GH touchable there loses to
 * the card's gestures), native a gesture-handler touchable. 44pt hit area.
 */
function CardCornerControl({ onOpenMenu, onRemove, menuLabel, removeLabel }: CardCornerControlProps) {
  const activate = onOpenMenu ?? onRemove
  if (!activate) return null
  const label = onOpenMenu ? menuLabel : removeLabel
  const glyph = <Ionicons name={onOpenMenu ? 'ellipsis-horizontal' : 'close'} size={15} color={theme.colors.subtext} />
  return Platform.OS === 'web' ? (
    <View
      onStartShouldSetResponder={() => true}
      onResponderRelease={activate}
      style={[onOpenMenu ? shared.rowMenuTrigger : styles.removeBtn, styles.removeBtnHit]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {glyph}
    </View>
  ) : (
    <GHTouchableOpacity
      onPress={activate}
      style={[onOpenMenu ? shared.rowMenuTrigger : styles.removeBtn, styles.removeBtnHit]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {glyph}
    </GHTouchableOpacity>
  )
}

// ─── People tab body ─────────────────────────────────────────────────────────

type Props = {
  event: EventWithDetails
  eventStatus: AttendanceStatus
  /** Roster lists + pull-to-refresh. */
  data: EventData
  teams: EventTeamsApi
  drag: TeamDragApi
  /** Request approval / waitlist promotion. */
  attendance: EventAttendanceApi
  isHostOrCohost: boolean
  isMobileWeb: boolean
  docScrollActive: boolean
  onOpenProfile: (userId: string) => void
  onRemoveAttendee: (profile: Profile) => void
  onRemoveGuest: (g: EventGuest) => void
  onDeny: (userId: string, displayName: string) => void
  /** Opens (or creates) a DM. Offered on the roster to hosts and co-hosts only. */
  onMessage?: (userId: string) => void
  /** Users the viewer has silenced: the roster never offers to message them. */
  silencedUserIds: ReadonlySet<string>
  /** Hosts/co-hosts on a paid event: who marked "I've paid". Null hides payment UI. */
  payments: EventPaymentsApi | null
}

export function PeopleTab({
  event,
  eventStatus,
  data,
  teams,
  drag,
  attendance,
  isHostOrCohost,
  isMobileWeb,
  docScrollActive,
  onOpenProfile,
  onRemoveAttendee,
  onRemoveGuest,
  onDeny,
  onMessage,
  silencedUserIds,
  payments,
}: Props) {
  const { refreshing } = data
  const onRefresh = () => Promise.all([data.refresh(), payments?.refetch()])
  const paidCount = payments ? attendeesPaid(data.roster.attendees, payments.paidUserIds) : 0
  const { attendees, attendingGuests: guests, adderUsernames, requestedProfiles, waitlistProfiles, waitlistGuests } = data.roster
  const {
    assignments, numTeams, setNumTeams, hasTeams, savingTeams,
    togglePin: onTogglePin, resetTeams: onResetTeams, randomizeTeams: onRandomizeTeams, saveTeams: onSaveTeams,
  } = teams
  const { hoveredTeamKey, teamZoneRefs, onDragStart, onDragMove, onDragEnd } = drag
  const { processingRequest, approveRequest: onApproveRequest, approveFromWaitlist: onApproveFromWaitlist } = attendance

  // ── Per-row ⋯ menu (one sheet for the whole tab) ──
  const [rowMenu, setRowMenu] = useState<RosterMenu | null>(null)
  const actionCtx: RosterActionContext = {
    canMessage: isHostOrCohost,
    viewerId: data.userId,
    silencedUserIds,
    onMessage,
    onOpenProfile,
  }
  const openMenu = (title: string, actions: RosterAction[]) =>
    hasRosterMenu(actions) ? () => setRowMenu({ title, actions }) : undefined
  const removeAttendee = (profile: Profile) => (eventStatus.isOwner ? () => onRemoveAttendee(profile) : undefined)
  const removeGuest = (g: EventGuest) => (eventStatus.isOwner ? () => onRemoveGuest(g) : undefined)
  const guestName = (g: EventGuest) => `${g.first_name} ${g.last_name}`

  /** ⋯ for the flat request / waitlist rows (roster cards use CardCornerControl). */
  function rowMenuButton(title: string, actions: RosterAction[]) {
    const open = openMenu(title, actions)
    if (!open) return null
    return <IconButton icon="ellipsis-horizontal" size={44} label={`Actions for ${title}`} onPress={open} />
  }

  function renderCard(profile: Profile) {
    const a = assignments[profile.id]
    const teamNum = a?.team ?? null
    const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
    const card = (
      <DraggablePlayerCard
        profile={profile}
        teamColor={teamColor}
        isPinned={a?.pinned ?? false}
        isOwner={eventStatus.isOwner}
        onDragStart={(x, y) => onDragStart(profile.id, x, y)}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onRemove={() => onRemoveAttendee(profile)}
        onTogglePin={() => onTogglePin(profile.id)}
        onOpenMenu={openMenu(profileDisplayName(profile), memberRowActions(profile, actionCtx, removeAttendee(profile)))}
        paid={payments ? payments.paidUserIds.has(profile.id) : undefined}
      />
    )
    if (eventStatus.isOwner) {
      return <View key={profile.id} style={[shared.playerCell, isMobileWeb && { width: '50%' }]}>{card}</View>
    }
    return (
      <TouchableOpacity key={profile.id} style={[shared.playerCell, isMobileWeb && { width: '50%' }]} onPress={() => onOpenProfile(profile.id)}>
        {card}
      </TouchableOpacity>
    )
  }

  function renderGuestCard(g: EventGuest) {
    const a = assignments[g.id]
    const teamNum = a?.team ?? null
    const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
    return (
      <View key={g.id} style={[shared.playerCell, isMobileWeb && { width: '50%' }]}>
        <DraggableGuestCard
          guest={g}
          adderUsername={adderUsernames[g.added_by] ?? '?'}
          teamColor={teamColor}
          isPinned={a?.pinned ?? false}
          isOwner={eventStatus.isOwner}
          onDragStart={(x, y) => onDragStart(g.id, x, y)}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onRemove={() => onRemoveGuest(g)}
          onTogglePin={() => onTogglePin(g.id)}
          onOpenMenu={openMenu(guestName(g), guestRowActions(g, adderUsernames[g.added_by], actionCtx, removeGuest(g)))}
        />
      </View>
    )
  }

  return (
    <>
    <DocScrollView
      docScroll={docScrollActive}
      style={shared.screen}
      contentContainerStyle={shared.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      {/* Going + Teams */}
      <View style={[shared.rowBetween, shared.mb_sm]}>
        <Text style={shared.subheading}>Going</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text style={shared.caption}>
            {eventStatus.count}{event.max_attendees ? ` / ${event.max_attendees}` : ''} people
          </Text>
          {eventStatus.isOwner && attendees.length > 0 && (
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, numTeams <= 2 && styles.stepBtnDisabled]}
                onPress={() => setNumTeams(t => Math.max(2, t - 1))}
                disabled={numTeams <= 2}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepLabel}>{numTeams} teams</Text>
              <TouchableOpacity
                style={[styles.stepBtn, numTeams >= Math.min(6, attendees.length + guests.length) && styles.stepBtnDisabled]}
                onPress={() => setNumTeams(t => Math.min(6, attendees.length + guests.length, t + 1))}
                disabled={numTeams >= Math.min(6, attendees.length + guests.length)}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {payments && attendees.length > 0 && (
        <View testID="roster-paid-summary" style={[shared.row, { gap: 6, marginBottom: theme.spacing.sm }]}>
          <Ionicons name="cash-outline" size={14} color={theme.colors.subtext} />
          <Text style={shared.caption}>
            {paidCount} of {attendees.length} marked paid
            {guests.length > 0 ? ' · +1 guests are covered by whoever added them' : ''}
          </Text>
        </View>
      )}

      {attendees.length === 0 && guests.length === 0
        ? <Text style={shared.caption}>no one yet — be the first!</Text>
        : !hasTeams
          ? (
            <View
              ref={(r) => { teamZoneRefs.current['unassigned'] = r as View | null }}
              style={[styles.dropZone, hoveredTeamKey === 'unassigned' && styles.dropZoneActive]}
            >
              <View style={shared.playerGrid}>
                {attendees.map(renderCard)}
                {guests.map(renderGuestCard)}
              </View>
            </View>
          )
          : (() => {
            const unassigned = attendees.filter(p => !assignments[p.id]?.team)
            const unassignedGuests = guests.filter(g => !assignments[g.id]?.team)
            return (
              <View style={{ gap: theme.spacing.sm }}>
                {Array.from({ length: numTeams }, (_, i) => i + 1).map(teamNum => {
                  const teamPlayers = attendees.filter(p => assignments[p.id]?.team === teamNum)
                  const teamGuests  = guests.filter(g => assignments[g.id]?.team === teamNum)
                  const teamColor = TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length]
                  const isHovered = hoveredTeamKey === String(teamNum)
                  return (
                    <View
                      key={teamNum}
                      ref={(r) => { teamZoneRefs.current[String(teamNum)] = r as View | null }}
                      style={[styles.dropZone, isHovered && { backgroundColor: teamColor + '14', borderColor: teamColor + '60' }]}
                    >
                      <View style={shared.teamHeader}>
                        <View style={[shared.teamDot, { backgroundColor: teamColor }]} />
                        <Text style={[shared.teamHeading, { color: teamColor }]}>{TEAM_COLOR_NAMES[(teamNum - 1) % TEAM_COLOR_NAMES.length]} Team</Text>
                      </View>
                      {teamPlayers.length === 0 && teamGuests.length === 0
                        ? <Text style={[shared.caption, { paddingHorizontal: theme.spacing.xs, paddingBottom: theme.spacing.xs }]}>No players</Text>
                        : <View style={shared.playerGrid}>{teamPlayers.map(renderCard)}{teamGuests.map(renderGuestCard)}</View>
                      }
                    </View>
                  )
                })}
                {(unassigned.length > 0 || unassignedGuests.length > 0) && (
                  <View
                    ref={(r) => { teamZoneRefs.current['unassigned'] = r as View | null }}
                    style={[styles.dropZone, hoveredTeamKey === 'unassigned' && styles.dropZoneActive]}
                  >
                    <View style={shared.teamHeader}>
                      <View style={[shared.teamDot, { backgroundColor: theme.colors.subtext }]} />
                      <Text style={[shared.teamHeading, { color: theme.colors.subtext }]}>Unassigned</Text>
                    </View>
                    <View style={shared.playerGrid}>
                      {unassigned.map(renderCard)}
                      {unassignedGuests.map(renderGuestCard)}
                    </View>
                  </View>
                )}
              </View>
            )
          })()
      }

      {/* Randomize + Save — host only */}
      {eventStatus.isOwner && attendees.length > 0 && (
        <>
          {(attendees.length + guests.length) % numTeams !== 0 && (
            <Text style={[shared.caption, { marginTop: theme.spacing.sm, color: theme.colors.error }]}>
              {attendees.length + guests.length} players can't be split into {numTeams} equal teams
            </Text>
          )}
          <View style={[shared.row, { gap: theme.spacing.sm, marginTop: theme.spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Button label="Reset" onPress={onResetTeams} variant="secondary" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Randomize" onPress={onRandomizeTeams} variant="secondary" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Save" onPress={onSaveTeams} loading={savingTeams} />
            </View>
          </View>
        </>
      )}

      {/* Requested section — host/cohost only, paid events */}
      {isHostOrCohost && requestedProfiles.length > 0 && (
        <>
          <View style={shared.divider} />
          <View style={[shared.rowBetween, shared.mb_sm]}>
            <Text style={shared.subheading}>Requested</Text>
            <Text style={shared.caption}>{requestedProfiles.length} pending</Text>
          </View>
          <View style={{ gap: theme.spacing.xs }}>
            {requestedProfiles.map(profile => (
              <View key={profile.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => onOpenProfile(profile.id)}>
                  <Text style={shared.body}>{profileDisplayName(profile)}</Text>
                  <Text style={[shared.caption, { marginTop: 2 }]} numberOfLines={2}>
                    {hostRosterSkillAndPositionsLine(profile)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onApproveRequest(profile.id)}
                  disabled={processingRequest === profile.id}
                  style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.success, borderRadius: theme.radius.md }}
                >
                  {processingRequest === profile.id
                    ? <ActivityIndicator size="small" color={theme.colors.white} />
                    : <Text style={{ color: theme.colors.white, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Approve</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDeny(profile.id, profileDisplayName(profile))}
                  disabled={processingRequest === profile.id}
                  style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.error + '18', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.error + '40' }}
                >
                  <Text style={{ color: theme.colors.error, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Deny</Text>
                </TouchableOpacity>
                {rowMenuButton(profileDisplayName(profile), memberRowActions(profile, actionCtx))}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Waitlist section */}
      {(eventStatus.waitlistCount > 0 || waitlistGuests.length > 0 || (eventStatus.isFull && !eventStatus.isAttending && !eventStatus.isWaitlisted)) && (
        <>
          <View style={shared.divider} />
          <View style={[shared.rowBetween, shared.mb_sm]}>
            <Text style={shared.subheading}>Waitlist</Text>
            <Text style={shared.caption}>{eventStatus.waitlistCount + waitlistGuests.length} waiting</Text>
          </View>
          {waitlistProfiles.length === 0 && waitlistGuests.length === 0 ? (
            <Text style={shared.caption}>No one on the waitlist yet</Text>
          ) : (
            <View style={{ gap: theme.spacing.xs }}>
              {waitlistProfiles.map((profile, idx) => (
                <View key={profile.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                  <Text style={[shared.caption, { minWidth: 20, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }]}>#{idx + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={shared.body}>{profileDisplayName(profile)}</Text>
                    {eventStatus.isOwner ? (
                      <Text style={[shared.caption, { marginTop: 2 }]} numberOfLines={2}>
                        {hostRosterSkillAndPositionsLine(profile)}
                      </Text>
                    ) : null}
                  </View>
                  {eventStatus.isOwner && (
                    <TouchableOpacity
                      onPress={() => onApproveFromWaitlist(profile.id)}
                      style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md }}
                    >
                      <Text style={{ color: theme.colors.white, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Approve</Text>
                    </TouchableOpacity>
                  )}
                  {rowMenuButton(profileDisplayName(profile), memberRowActions(profile, actionCtx))}
                </View>
              ))}
              {waitlistGuests.map((g, idx) => (
                <View key={g.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                  <Text style={[shared.caption, { minWidth: 20, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }]}>#{waitlistProfiles.length + idx + 1}</Text>
                  <Text style={[shared.body, { flex: 1 }]}>{g.first_name} {g.last_name}</Text>
                  <View style={shared.tag}><Text style={shared.tagText}>Guest</Text></View>
                  {(() => {
                    const actions = guestRowActions(g, adderUsernames[g.added_by], actionCtx, removeGuest(g))
                    if (hasRosterMenu(actions)) return rowMenuButton(guestName(g), actions)
                    return eventStatus.isOwner ? (
                      <TouchableOpacity
                        onPress={() => onRemoveGuest(g)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove guest ${guestName(g)}`}
                      >
                        <Ionicons name="close" size={16} color={theme.colors.subtext} />
                      </TouchableOpacity>
                    ) : null
                  })()}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </DocScrollView>
    <RosterActionsSheet menu={rowMenu} onDismiss={() => setRowMenu(null)} />
    </>
  )
}

const styles = StyleSheet.create({
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 3,
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.success + '1A',
    borderWidth: 1,
    borderColor: theme.colors.success + '40',
  },
  paidBadgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.success,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: {
    fontSize: theme.font.size.lg,
    color: theme.colors.primary,
    lineHeight: 22,
  },
  stepLabel: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  dropZone: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: theme.spacing.xs,
  },
  dropZoneActive: {
    backgroundColor: theme.colors.subtext + '12',
    borderColor: theme.colors.subtext + '40',
  },
  removeBtn: {
    padding: 4,
  },
  removeBtnHit: {
    zIndex: 2,
    elevation: 2,
  },
})
