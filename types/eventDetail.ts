// Types for the event screen's flows (#354): which dialog or sheet is open, and what the
// leave sheet and the join-intent sheet show.
import type { AttendanceStatus, JoinOffer, LeaveConsequence, Profile } from './index'

/** The leave sheet's content, frozen when it opens so the optimistic leave doesn't reshuffle it. */
export type LeaveSheetContent = { subtitle: string; lines: LeaveConsequence[]; showReason: boolean }

/** The "Grab your spot?" sheet after a guest's Join (#229): offer the spot, then player setup. */
export type JoinIntentState = { stage: 'offer' | 'setup'; offer: JoinOffer }

/**
 * The one dialog or sheet open over the event screen. Removing a participant and
 * co-hosts keep their own hooks (`useRemoveDialog`, `useCohosts`).
 */
export type EventDialogState =
  | { kind: 'deny'; userId: string; displayName: string }
  | { kind: 'guest' }
  | { kind: 'delete' }
  | ({ kind: 'leave' } & LeaveSheetContent)
  | ({ kind: 'joinIntent' } & JoinIntentState)
  | null

/** What a guest's saved Join turns into once they're signed in and the event has loaded. */
export type JoinIntentDecision =
  | { outcome: 'none' } // nothing saved for this event
  | { outcome: 'expired' }
  | { outcome: 'skipped' } // already on the list, full of requests, over, cancelled, their own game
  | { outcome: 'offer'; offer: JoinOffer }

/** The status `shouldOfferJoin` needs. */
export type JoinIntentStatus = Pick<AttendanceStatus, 'isAttending' | 'isWaitlisted' | 'isRequested' | 'isDenied' | 'isFull' | 'isOwner'>

/** People who can be @mentioned in the Discussion: attendees, co-hosts and the host. */
export type MentionSource = {
  attendees: readonly Profile[]
  cohostProfiles: readonly (Profile | null | undefined)[]
  host: Profile | null | undefined
}
