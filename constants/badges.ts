import type { BadgeType, CardBgType, ProfileBorder } from '../types'

// ─── Category gradients (Discord-style: each badge type has its own palette) ──
// Top color is used for glow; bottom for the gradient fill.
export const BADGE_CATEGORY_GRADIENTS: Record<string, readonly [string, string]> = {
  vex_spirit:          ['#7DBF8E', '#3D7A52'],
  event_attendee:      ['#4FC3F7', '#1565C0'],
  event_host:          ['#FF7043', '#BF360C'],
  cheers_received:     ['#FFD700', '#FF8F00'],
  cheers_given:        ['#F06292', '#880E4F'],
  spike_cheer:         ['#FF5252', '#C62828'],
  serve_cheer:         ['#26C6DA', '#00838F'],
  block_cheer:         ['#9575CD', '#4527A0'],
  set_cheer:           ['#66BB6A', '#2E7D32'],
  dig_pass_cheer:      ['#29B6F6', '#01579B'],
  communication_cheer: ['#FFCA28', '#E65100'],
  beta_tester:         ['#A78BFA', '#6C47FF'],
  tournament_director: ['#FFD700', '#FF6F00'],
  profile_complete:    ['#4CAF50', '#1B5E20'],
}

// ─── Beta flag ────────────────────────────────────────────────────────────────
// Set to false when the beta period ends — beta_tester will no longer be granted.
export const BETA_ACTIVE = true

// ─── Vex Spirit flag ──────────────────────────────────────────────────────────
// false = never auto-awarded; grant manually via DB insert per user.
export const VEX_MEMBER_ACTIVE = false

// ─── Tier color palette ───────────────────────────────────────────────────────
export const BADGE_TIER_COLORS: Record<number, string> = {
  1: '#CD7F32', // bronze
  2: '#A8A9AD', // silver
  3: '#FFD700', // gold
  4: '#008E91', // platinum / Elite: teal distinguishes it from silver
  5: '#A59AF8', // diamond / Legend: lavender
}

/** Color used for single-level achievement badges (beta, tournament director, etc.) */
export const BADGE_SINGLE_COLOR = '#FFD700'

// ─── Stat identifiers ─────────────────────────────────────────────────────────
export type BadgeStat =
  | 'events_attended_past'
  | 'events_hosted_past'
  | 'cheers_received_total'
  | 'cheers_given_events'
  | 'spike_cheers'
  | 'serve_cheers'
  | 'block_cheers'
  | 'set_cheers'
  | 'dig_pass_cheers'
  | 'communication_cheers'
  | 'beta_active'
  | 'tournament_hosted'
  | 'profile_complete'
  | 'vex_member'

// ─── Badge definitions ────────────────────────────────────────────────────────
export type BadgeTierDef = {
  tier: number
  label: string
  /** Minimum stat value to reach this tier. */
  threshold: number
}

export type BadgeDef = {
  type: BadgeType
  /** Ionicons name — ignored when imageSource is set. */
  icon: string
  /** Remote image URL (Supabase Storage public URL). Renders instead of the icon when set. */
  imageUri?: string
  /** Per-tier image URLs. When set, the image for the earned tier is shown; falls back to imageUri or icon. */
  tierImageUris?: Record<number, string>
  description: string
  stat: BadgeStat
  tiers: BadgeTierDef[]
}

export const BADGE_DEFINITIONS: BadgeDef[] = [
  // ── Participation ──
  {
    type: 'event_attendee',
    icon: 'calendar-outline',
    description: 'Attend events',
    stat: 'events_attended_past',
    tiers: [
      { tier: 1, label: 'Newcomer', threshold: 1 },
      { tier: 2, label: 'Regular',  threshold: 5 },
      { tier: 3, label: 'Veteran',  threshold: 10 },
      { tier: 4, label: 'Elite',    threshold: 25 },
      { tier: 5, label: 'Legend',   threshold: 100 },
    ],
  },
  {
    type: 'event_host',
    icon: 'megaphone-outline',
    description: 'Host events',
    stat: 'events_hosted_past',
    tiers: [
      { tier: 1, label: 'Host',         threshold: 1 },
      { tier: 2, label: 'Organizer',    threshold: 5 },
      { tier: 3, label: 'Head Honcho',  threshold: 25 },
    ],
  },
  // ── Cheers ──
  {
    type: 'cheers_received',
    icon: 'star-outline',
    description: 'Receive cheers from other players',
    stat: 'cheers_received_total',
    tiers: [
      { tier: 1, label: 'Rising Star',    threshold: 10 },
      { tier: 2, label: 'Fan Favorite',   threshold: 50 },
      { tier: 3, label: 'Main Character', threshold: 150 },
    ],
  },
  {
    type: 'cheers_given',
    icon: 'heart-outline',
    description: 'Give cheers to other players',
    stat: 'cheers_given_events',
    tiers: [
      { tier: 1, label: 'Supportive',    threshold: 5 },
      { tier: 2, label: 'Team Spirit',   threshold: 20 },
      { tier: 3, label: 'MVP Supporter', threshold: 50 },
    ],
  },
  // ── Volleyball skills ──
  {
    type: 'spike_cheer',
    icon: 'flash-outline',
    description: 'Receive spiking cheers',
    stat: 'spike_cheers',
    tierImageUris: {
      1: 'https://rmelsdqgrpfjzqisycdl.supabase.co/storage/v1/object/public/badges/spike_tier1_bronze.png?v=2',
      2: 'https://rmelsdqgrpfjzqisycdl.supabase.co/storage/v1/object/public/badges/spike_tier2_silver.png?v=4',
      3: 'https://rmelsdqgrpfjzqisycdl.supabase.co/storage/v1/object/public/badges/spike_tier3_gold.png?v=2',
    },
    tiers: [
      { tier: 1, label: 'Spiker',   threshold: 5 },
      { tier: 2, label: 'Bouncer',  threshold: 15 },
      { tier: 3, label: 'Nuke',     threshold: 30 },
    ],
  },
  {
    type: 'serve_cheer',
    icon: 'radio-outline',
    description: 'Receive serving cheers',
    stat: 'serve_cheers',
    tiers: [
      { tier: 1, label: 'Server',       threshold: 5 },
      { tier: 2, label: 'Ace',          threshold: 15 },
      { tier: 3, label: 'Miya Atsumu',  threshold: 30 },
    ],
  },
  {
    type: 'block_cheer',
    icon: 'shield-outline',
    description: 'Receive blocking cheers',
    stat: 'block_cheers',
    tiers: [
      { tier: 1, label: 'Blocker',    threshold: 5 },
      { tier: 2, label: 'Wall',       threshold: 15 },
      { tier: 3, label: 'Iron Wall',  threshold: 30 },
    ],
  },
  {
    type: 'set_cheer',
    icon: 'git-merge-outline',
    description: 'Receive setting cheers',
    stat: 'set_cheers',
    tiers: [
      { tier: 1, label: 'Setter',        threshold: 5 },
      { tier: 2, label: 'Floor General', threshold: 15 },
      { tier: 3, label: 'Maestro',       threshold: 30 },
    ],
  },
  {
    type: 'dig_pass_cheer',
    icon: 'arrow-down-circle-outline',
    description: 'Receive digging and passing cheers',
    stat: 'dig_pass_cheers',
    tiers: [
      { tier: 1, label: 'Digger',               threshold: 5 },
      { tier: 2, label: 'Back Row Specialist',  threshold: 15 },
      { tier: 3, label: 'Libero',               threshold: 30 },
    ],
  },
  {
    type: 'communication_cheer',
    icon: 'chatbubbles-outline',
    description: 'Receive communication cheers',
    stat: 'communication_cheers',
    tiers: [
      { tier: 1, label: 'Team Player', threshold: 5 },
      { tier: 2, label: 'Shot Caller', threshold: 15 },
      { tier: 3, label: 'The Coach',   threshold: 30 },
    ],
  },
  // ── Special ──
  {
    type: 'beta_tester',
    icon: 'rocket-outline',
    description: 'Participated in the app beta',
    stat: 'beta_active',
    tiers: [{ tier: 1, label: 'Beta Tester', threshold: 1 }],
  },
  {
    type: 'tournament_director',
    icon: 'trophy-outline',
    description: 'Host a tournament',
    stat: 'tournament_hosted',
    tiers: [{ tier: 1, label: 'Tournament Director', threshold: 1 }],
  },
  {
    type: 'profile_complete',
    icon: 'checkmark-circle-outline',
    description: 'Fill out your full profile',
    stat: 'profile_complete',
    tiers: [{ tier: 1, label: 'Profile Complete', threshold: 1 }],
  },
  // ── Club mascot ──
  {
    type: 'vex_spirit',
    icon: 'heart-outline',
    imageUri: 'https://rmelsdqgrpfjzqisycdl.supabase.co/storage/v1/object/public/badges/vex.png',
    description: 'The Vex — club mascot badge awarded to all members',
    stat: 'vex_member',
    tiers: [{ tier: 1, label: 'Vex Spirit', threshold: 1 }],
  },
]

// ─── Profile borders ──────────────────────────────────────────────────────────
/** Same as `ProfileBorder` in types (the `profiles.selected_border` values). */
export type ProfileBorderType = ProfileBorder

export type ProfileBorderDef = {
  type: ProfileBorderType
  label: string
  /** Solid border color (used for bronze/gold, and as fallback for gradient). */
  color: string
  /** Gradient colors — defined means use LinearGradient. */
  gradientColors?: readonly string[]
  /** Gradient stops for the picker swatch (so swatches are driven by data, not per-type branches). */
  ringColors: readonly [string, string, ...string[]]
  description: string
  /** One of these badge+tier combos must be met to unlock this border. */
  unlockedBy: { badgeType: BadgeType; minTier: number }[]
}

export const PROFILE_BORDERS: ProfileBorderDef[] = [
  {
    type: 'bronze',
    label: 'Bronze',
    color: '#CD7F32',
    ringColors: ['#CD7F32', '#CD7F32'],
    description: 'Reach Veteran (10 events) or Organizer (5 hosted)',
    unlockedBy: [
      { badgeType: 'event_attendee', minTier: 3 },
      { badgeType: 'event_host', minTier: 2 },
    ],
  },
  {
    type: 'gold',
    label: 'Gold',
    color: '#FFD700',
    ringColors: ['#FFE066', '#FFD700', '#CC8800'],
    description: 'Reach Elite (25 events) or Head Honcho (25 hosted)',
    unlockedBy: [
      { badgeType: 'event_attendee', minTier: 4 },
      { badgeType: 'event_host', minTier: 3 },
    ],
  },
  {
    type: 'gradient',
    label: 'Legend',
    color: '#6C47FF',
    gradientColors: ['#6C47FF', '#FFD700', '#B9F2FF'] as const,
    ringColors: ['#6C47FF', '#FFD700', '#B9F2FF'],
    description: 'Reach Legend (100 events attended)',
    unlockedBy: [{ badgeType: 'event_attendee', minTier: 5 }],
  },
]

/** Returns the label for a badge at a given tier (falls back to the badge def description). */
export function badgeTierLabel(def: BadgeDef, tier: number): string {
  return def.tiers.find(t => t.tier === tier)?.label ?? def.description
}

/** Returns a display title for a badge type. */
export function badgeTitle(type: BadgeType): string {
  const titles: Record<BadgeType, string> = {
    event_attendee:      'Event Attendance',
    event_host:          'Event Host',
    cheers_received:     'Cheers Received',
    cheers_given:        'Cheers Given',
    spike_cheer:         'Spike',
    serve_cheer:         'Serve',
    block_cheer:         'Block',
    set_cheer:           'Set',
    dig_pass_cheer:      'Dig & Pass',
    communication_cheer: 'Communication',
    beta_tester:         'Beta Tester',
    tournament_director: 'Tournament Director',
    profile_complete:    'Profile Complete',
    vex_spirit:          'The Vex',
  }
  return titles[type] ?? type
}

/** Returns the color for a given tier level. Single-level badges always return BADGE_SINGLE_COLOR. */
export function badgeTierColor(def: BadgeDef, tier: number): string {
  if (def.tiers.length === 1) return BADGE_SINGLE_COLOR
  return BADGE_TIER_COLORS[tier] ?? BADGE_TIER_COLORS[1]
}

// ─── Card backgrounds ─────────────────────────────────────────────────────────

export type CardBgDef = {
  type: CardBgType
  label: string
  /** [dark-start, mid, transparent] — gradient goes top-left → bottom-right */
  colors: readonly [string, string, string]
  description: string
  unlockedBy: { badgeType: BadgeType; minTier: number }[]
}

export const CARD_BACKGROUNDS: CardBgDef[] = [
  {
    type: 'ember',
    label: 'Ember',
    colors: ['#7A2800', '#2A0E00', '#100500'] as const,
    description: 'Reach Elite (25 events attended)',
    unlockedBy: [{ badgeType: 'event_attendee', minTier: 4 }],
  },
  {
    type: 'frost',
    label: 'Frost',
    colors: ['#002A5C', '#00101E', '#00060F'] as const,
    description: 'Reach Main Character (150 cheers received)',
    unlockedBy: [{ badgeType: 'cheers_received', minTier: 3 }],
  },
  {
    type: 'aurora',
    label: 'Aurora',
    colors: ['#2C0058', '#003828', '#000F08'] as const,
    description: 'Reach Legend (100 events attended)',
    unlockedBy: [{ badgeType: 'event_attendee', minTier: 5 }],
  },
]

export function isCardBgUnlocked(
  bgDef: CardBgDef,
  earnedBadges: { badge_type: string; tier: number }[],
): boolean {
  return bgDef.unlockedBy.some(req => {
    const earned = earnedBadges.find(b => b.badge_type === req.badgeType)
    return earned != null && earned.tier >= req.minTier
  })
}

/** Returns whether the user's badges unlock a given border type. */
export function isBorderUnlocked(
  borderDef: ProfileBorderDef,
  earnedBadges: { badge_type: string; tier: number }[],
): boolean {
  return borderDef.unlockedBy.some(req => {
    const earned = earnedBadges.find(b => b.badge_type === req.badgeType)
    return earned != null && earned.tier >= req.minTier
  })
}
