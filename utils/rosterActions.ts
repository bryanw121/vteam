import type { EventGuest, NoShowRowAction, Profile, RosterAction, RosterActionContext } from '../types'
import { NO_SHOW_MARK_LABEL, NO_SHOW_MARK_SUBTITLE, NO_SHOW_UNDO_LABEL, NO_SHOW_UNDO_SUBTITLE } from '../constants/copy'

/**
 * The People tab's per-row ⋯ menu (#40). The risky part is the gates, not the
 * happy path: who is offered Message, and who must never be.
 *
 * Messaging is host → attendee only. An organiser has a real operational need to
 * reach one person; attendee → attendee DMs from a roster are an unsolicited-
 * contact vector that needs its own design.
 *
 * Silences are one-directional: `chat_silences` is readable only where
 * `auth.uid() = user_id`, so the viewer can hide Message for people *they* have
 * silenced, but cannot learn who has silenced *them* (that needs a server-side
 * check; deliberately not invented here).
 */

/** A menu with one entry turns one tap into two and hides the action: show the direct control instead. */
export const ROSTER_MENU_MIN_ACTIONS = 2

export function hasRosterMenu(actions: RosterAction[]): boolean {
  return actions.length >= ROSTER_MENU_MIN_ACTIONS
}

/** Can the viewer start a DM with this person from the roster? */
export function canMessageFromRoster(userId: string, ctx: RosterActionContext): boolean {
  return ctx.canMessage
    && !!ctx.onMessage
    && !!ctx.viewerId
    && userId !== ctx.viewerId
    && !ctx.silencedUserIds.has(userId)
}

/**
 * Member row: Message (leads, it's what the menu is for), View profile, then
 * Mark as no-show / Undo no-show when the caller passes it (host or co-host,
 * inside the window, not their own row: #151), Remove (last, destructive).
 */
export function memberRowActions(
  profile: Pick<Profile, 'id'>,
  ctx: RosterActionContext,
  onRemove?: () => void,
  noShow?: NoShowRowAction,
): RosterAction[] {
  const out: RosterAction[] = []
  if (canMessageFromRoster(profile.id, ctx)) {
    out.push({ key: 'message', label: 'Message', onPress: () => ctx.onMessage?.(profile.id) })
  }
  out.push({ key: 'profile', label: 'View profile', onPress: () => ctx.onOpenProfile(profile.id) })
  if (noShow && profile.id !== ctx.viewerId) {
    out.push(noShow.flagged
      ? { key: 'no-show', label: NO_SHOW_UNDO_LABEL, subtitle: NO_SHOW_UNDO_SUBTITLE(noShow.until), onPress: noShow.onToggle }
      : { key: 'no-show', label: NO_SHOW_MARK_LABEL, subtitle: NO_SHOW_MARK_SUBTITLE(noShow.until), caution: true, onPress: noShow.onToggle })
  }
  if (onRemove) out.push({ key: 'remove', label: 'Remove from event', destructive: true, onPress: onRemove })
  return out
}

/**
 * +1 row. A guest has no account, so there is nobody to message: offer the
 * member who added them, who is who the host actually needs to reach.
 */
export function guestRowActions(
  guest: Pick<EventGuest, 'added_by'>,
  adderUsername: string | undefined,
  ctx: RosterActionContext,
  onRemove?: () => void,
): RosterAction[] {
  const out: RosterAction[] = []
  if (canMessageFromRoster(guest.added_by, ctx)) {
    out.push({
      key: 'message-adder',
      label: adderUsername ? `Message ${adderUsername}` : 'Message who added them',
      onPress: () => ctx.onMessage?.(guest.added_by),
    })
  }
  if (onRemove) out.push({ key: 'remove', label: 'Remove guest', destructive: true, onPress: onRemove })
  return out
}
