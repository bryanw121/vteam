import type { Surface } from '../types'

/**
 * What to bring (#256): the gear a game needs, listed by the host and claimed
 * by players who are going. Limits match the database checks in
 * `save_event_bring_items` / `claim_bring_item` (migration 20261112190000).
 */
export const BRING_LIMITS = {
  /** Items per event. */
  items: 8,
  /** Characters in an item's name. */
  label: 40,
  /** Most of one item a game can ask for (balls). */
  quantity: 6,
} as const

/** Suggestion chips in the host form, by court surface. The first is marked required when picked (no net, no game). */
export const BRING_SUGGESTIONS: Record<Surface | 'any', readonly string[]> = {
  sand: ['Net + antennas', 'Game balls', 'Boundary lines', 'Ball pump', 'Cones'],
  grass: ['Net + antennas', 'Game balls', 'Boundary lines', 'Ball pump', 'Cones'],
  indoor: ['Game balls', 'Ball pump', 'Speaker'],
  any: ['Net + antennas', 'Game balls', 'Ball pump'],
}

/** Suggestions that default to "required" when added (the game can't happen without them). */
export const BRING_REQUIRED_BY_DEFAULT: readonly string[] = ['Net + antennas']

/** Default quantity when a suggestion is added. */
export const BRING_DEFAULT_QUANTITY: Readonly<Record<string, number>> = { 'Game balls': 2 }

export const BRING_COPY = {
  title: 'What to bring',
  hostHint: 'Players who are going can say they\'ll bring each item.',
  addPlaceholder: 'Add something else…',
  mine: 'I\'m bringing it',
  required: 'Needed for the game',
  claim: 'I\'ll bring it',
  claimSome: (n: number) => `I'll bring ${n}`,
  bringing: 'Bringing',
  joinToBring: 'Join to bring something',
  stillNeeded: 'Still needed',
  covered: (claimed: number, total: number) => `${claimed} of ${total} covered`,
  letGoHint: 'Can\'t bring it after all? Tap Bringing to let go.',
  claimFailed: 'Couldn\'t save that',
  released: (label: string) => `You're no longer bringing ${label}`,
  claimed: (label: string) => `You're bringing ${label}`,
} as const
