import React from 'react'
import { Platform, TouchableOpacity, View } from 'react-native'
import { GestureDetector, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Animated from 'react-native-reanimated'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../ui/Text'
import { ProfileAvatar } from '../../ProfileAvatar'
import { shared, theme, teamColor as colorOfTeam, teamTint } from '../../../constants'
import { NO_SHOW_BADGE } from '../../../constants/copy'
import { profileAvatarSmallUri, profileDisplayName, hostRosterSkillAndPositionsLine } from '../../../utils'
import { guestFullName, guestInitials, guestShortName } from '../../../utils/guests'
import { profilePrefetchProps } from '../../../hooks/useUserProfile'
import { useDraggableCard } from '../../../hooks/event/useDraggableCard'
import type { EventGuest, Profile } from '../../../types'
import type { RosterCardContext, RosterCardShellProps } from '../../../types/people'

type CornerProps = Pick<RosterCardShellProps, 'onOpenMenu' | 'onRemove' | 'menuLabel' | 'removeLabel'> & { testID?: string }

/**
 * A roster card's single corner control: ⋯ when the row has a menu, else the
 * host's bare ✕, else nothing. It sits outside the card's pan/tap gestures so
 * presses register; web uses a responder View (a GH touchable there loses to
 * the card's gestures), native a gesture-handler touchable. 44pt hit area.
 */
function CardCornerControl({ onOpenMenu, onRemove, menuLabel, removeLabel, testID }: CornerProps) {
  const activate = onOpenMenu ?? onRemove
  if (!activate) return null
  const label = onOpenMenu ? menuLabel : removeLabel
  const style = [onOpenMenu ? shared.rowMenuTrigger : shared.peopleCardRemove, shared.peopleCardCorner]
  const glyph = <Ionicons name={onOpenMenu ? 'ellipsis-horizontal' : 'close'} size={15} color={theme.colors.subtext} />
  return Platform.OS === 'web' ? (
    <View
      onStartShouldSetResponder={() => true}
      onResponderRelease={activate}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      {glyph}
    </View>
  ) : (
    <GHTouchableOpacity onPress={activate} style={style} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      {glyph}
    </GHTouchableOpacity>
  )
}

/** One draggable roster card (#332): the host drags it between teams and taps it to pin it. */
export function RosterCardShell(p: RosterCardShellProps) {
  const { panGesture, tapGesture, animStyle } = useDraggableCard(p.isOwner, p)
  return (
    <View style={[shared.playerCardShell, p.noShow && shared.playerCardNoShow]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[shared.peopleCardGrab, animStyle]}>
          <GestureDetector gesture={tapGesture}>
            <View style={shared.peopleCardRow}>
              <View style={p.noShow ? shared.peopleCardDimmed : undefined}>{p.avatar}</View>
              <View style={shared.peopleCardText}>
                <Text style={shared.playerCardName} numberOfLines={1}>{p.title}</Text>
                {p.details}
              </View>
              {p.isOwner && p.locked && <Ionicons name="lock-closed" size={13} color={theme.colors.subtext} />}
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      <CardCornerControl
        onOpenMenu={p.onOpenMenu}
        onRemove={p.isOwner ? p.onRemove : undefined}
        menuLabel={p.menuLabel}
        removeLabel={p.removeLabel}
        testID={p.cornerTestID}
      />
    </View>
  )
}

function teamOf(ctx: RosterCardContext, id: string) {
  const a = ctx.assignments[id]
  const team = a?.team ?? null
  return { color: team !== null ? colorOfTeam(team) : null, pinned: a?.pinned ?? false }
}

function dragProps(ctx: RosterCardContext, id: string) {
  return {
    isOwner: ctx.isOwner,
    onDragStart: (x: number, y: number) => ctx.drag.onDragStart(id, x, y),
    onDragMove: ctx.drag.onDragMove,
    onDragEnd: ctx.drag.onDragEnd,
    onTogglePin: () => ctx.onTogglePin(id),
  }
}

const cellStyle = (ctx: RosterCardContext) => [shared.playerCell, ctx.isMobileWeb && shared.peopleCellHalf]

/** A player's card in its grid cell. Non-owners tap it to open the profile. */
export function PlayerRosterCell({ profile, ctx }: { profile: Profile; ctx: RosterCardContext }) {
  const team = teamOf(ctx, profile.id)
  const name = profileDisplayName(profile)
  const noShow = ctx.noShows.has(profile.id)
  const paid = ctx.paidUserIds ? ctx.paidUserIds.has(profile.id) : false
  const card = (
    <RosterCardShell
      {...dragProps(ctx, profile.id)}
      locked={team.pinned && !!team.color}
      noShow={noShow}
      avatar={<ProfileAvatar uri={profileAvatarSmallUri(profile.avatar_url)} border={profile.selected_border ?? null} size={34} />}
      title={name}
      details={(
        <>
          {ctx.isOwner ? <Text style={shared.peopleCardDetail} numberOfLines={2}>{hostRosterSkillAndPositionsLine(profile)}</Text> : null}
          {noShow && (
            <View testID="roster-no-show-badge" accessibilityLabel="Marked as a no-show" style={shared.noShowBadge}>
              <Text style={shared.noShowBadgeText} numberOfLines={1}>{NO_SHOW_BADGE}</Text>
            </View>
          )}
          {paid && (
            <View testID="roster-paid-badge" accessibilityLabel="Marked paid" style={shared.peoplePaidBadge}>
              <Ionicons name="checkmark" size={11} color={theme.colors.success} />
              <Text style={shared.peoplePaidBadgeText}>Paid</Text>
            </View>
          )}
        </>
      )}
      onOpenMenu={ctx.playerMenu(profile)}
      onRemove={() => ctx.onRemoveAttendee(profile)}
      menuLabel={`Actions for ${name}`}
      removeLabel={`Remove ${name}`}
      cornerTestID={`roster-menu-${profile.id}`}
    />
  )
  if (ctx.isOwner) return <View style={cellStyle(ctx)}>{card}</View>
  return (
    <TouchableOpacity style={cellStyle(ctx)} onPress={() => ctx.onOpenProfile(profile.id)} {...profilePrefetchProps(profile.id)}>
      {card}
    </TouchableOpacity>
  )
}

/** A +1's card: initials in the team colour and whose guest it is. */
export function GuestRosterCell({ guest, ctx }: { guest: EventGuest; ctx: RosterCardContext }) {
  const team = teamOf(ctx, guest.id)
  const full = guestFullName(guest)
  const avatar = (
    <View
      style={[
        shared.playerCardAvatar,
        team.color
          ? { borderColor: team.color, backgroundColor: teamTint(team.color, 'avatar'), borderWidth: 2 }
          : { borderColor: theme.colors.border, backgroundColor: theme.colors.background, borderWidth: 1.5 },
      ]}
    >
      <Text style={[shared.playerCardAvatarInitial, { color: team.color ?? theme.colors.subtext }]}>{guestInitials(guest)}</Text>
    </View>
  )
  return (
    <View style={cellStyle(ctx)}>
      <RosterCardShell
        {...dragProps(ctx, guest.id)}
        locked={team.pinned && !!team.color}
        avatar={avatar}
        title={guestShortName(guest)}
        details={<Text style={shared.peopleCardGuestDetail} numberOfLines={1}>{ctx.adderUsernames[guest.added_by] ?? '?'}'s +1</Text>}
        onOpenMenu={ctx.guestMenu(guest)}
        onRemove={() => ctx.onRemoveGuest(guest)}
        menuLabel={`Actions for guest ${full}`}
        removeLabel={`Remove guest ${full}`}
      />
    </View>
  )
}
