import type { ColorScheme } from './colorScheme'

/** The colour scheme this run of the app uses: picked once at startup (see lib/colorSchemeInit). */
export const colorScheme: ColorScheme =
  (globalThis as { __vteamColorScheme?: unknown }).__vteamColorScheme === 'dark' ? 'dark' : 'light'

export const lightColors = {
    // Brand
    primary:      '#7445F7',   // vteam purple: fills, white on it (5.3:1), and as text on background (4.9:1)
    primaryDark:  '#5B21B6',
    primarySoft:  '#EDE6FA',   // lavender tint for soft chip bgs
    primaryText:  '#6D28D9',   // purple for text and small icons on background/card (6.5:1)
    // Accent: sky blue (day chip)
    accent:       '#3DC9F5',
    accentInk:    '#002A36',
    // Surfaces
    background:   '#F7F3FF',   // light lavender page
    card:         '#FFFFFF',
    /** Create-menu pills over a blurred feed */
    fabMenuChip:       '#FFFFFF',
    fabMenuChipBorder: '#E4DAF5',
    /** Washes over `BlurView` so content recedes */
    fabMenuBackdropDim: 'rgba(30, 16, 51, 0.28)',
    // Text
    text:         '#1E1033',   // plum ink
    subtext:      '#6B5B85',   // muted plum (>= 4.5:1 on card, background and primarySoft)
    /** Secondary text that must stay readable, even inside a row dimmed to 72% (a read notification). */
    subtextStrong: '#4E3F66',
    // Borders
    border:       '#E4DAF5',
    borderSoft:   '#EFE9FA',
    /** Lavender pill behind the phone tab bar (Party invite nav). */
    navPill:      '#E9E0FF',
    navInk:       '#5B4B78',
    // Signal palette (also used as text: each >= 4.5:1 on white)
    warm:         '#AD3A0B',
    hot:          '#BE185D',
    cool:         '#0F766E',
    // Status
    error:        '#C62828',
    /** Filled destructive buttons (Button variant danger): white label at 5.6:1. */
    dangerFill:   '#C62828',
    warning:      '#92400E',
    success:      '#166534',
    // Toast surfaces (#228): light tints of each status colour, dark text on them.
    toastErrorBg:   '#FDE8EA',
    toastWarningBg: '#FDF0DE',
    toastSuccessBg: '#E3F6EA',
    toastInfoBg:    '#EDE6FA',
    white:        '#FFFFFF',
    sheetInk:     '#0D2480',   // pen ink on the official scoresheet (officialPdf.ts INK)
    black:        '#000000',
    /** Label/icon colour on `primary`, `error` and other saturated fills. */
    onPrimary:    '#FFFFFF',
    /** White text and lines on a `primary` fill at lower emphasis (heroes). */
    onPrimaryStrong: 'rgba(255,255,255,0.9)',
    onPrimarySoft:   'rgba(255,255,255,0.92)',
    onPrimaryMuted:  'rgba(255,255,255,0.92)',
    onPrimaryLine:   'rgba(255,255,255,0.35)',
    /** A darker well on a `primary` fill (stats, buttons on heroes): white text stays above 4.5:1. */
    onPrimaryFill:   'rgba(30,16,51,0.18)',
    /** Scrim behind dialogs and bottom sheets. */
    overlay:      'rgba(30,16,51,0.45)',
    overlayLight: 'rgba(30,16,51,0.4)',
    /** Dims everything but the highlighted target during a guided tour. */
    tourScrim:    'rgba(30,16,51,0.66)',
    // Podium / trophy medals
    medalGold:    '#E0A800',
    medalSilver:  '#90A4AE',
    medalBronze:  '#B7793A',
    // Event start time (TimePill, join bar): lavender pill
    time:         '#EDE6FA',
    timeBorder:   '#D9CCF5',
    timeInk:      '#5B21B6',
    timeText:     '#6D28D9',
    // Misc
    announcementHighlight: '#EDE6FA',
    /** Feed card cover blocks (Party invite): open play and tournaments. White text on both. */
    coverOpen:       '#7C3AED',
    coverTournament: '#DB2777',
}

export type ColorTokens = { [K in keyof typeof lightColors]: string }

export const darkColors: ColorTokens = {
  // Party invite, after dark (Nov 2026). Text colours are at least 4.5:1 on
  // `background`, `card` and `primarySoft` (__tests__/themeContrast.test.ts).
  // Fills keep the light values where white text sits on them.
  primary:      '#7445F7',
  primaryDark:  '#5B21B6',
  primarySoft:  '#2C1F4D',
  primaryText:  '#C4B0FF',
  accent:       '#3DC9F5',
  accentInk:    '#002A36',
  background:   '#140C24',
  card:         '#21173A',
  fabMenuChip:       '#21173A',
  fabMenuChipBorder: '#3A2C5C',
  fabMenuBackdropDim: 'rgba(0, 0, 0, 0.45)',
  text:         '#F4EEFF',
  subtext:      '#B8ACD0',
  subtextStrong: '#D6CCEA',
  border:       '#3A2C5C',
  borderSoft:   '#2C2147',
  navPill:      '#2C2050',
  navInk:       '#CFC3EA',
  warm:         '#FDBA74',
  hot:          '#F9A8D4',
  cool:         '#5EEAD4',
  error:        '#FCA5A5',
  dangerFill:   '#C62828',
  warning:      '#FCD34D',
  success:      '#86EFAC',
  toastErrorBg:   '#3B1820',
  toastWarningBg: '#3A2A12',
  toastSuccessBg: '#13301F',
  toastInfoBg:    '#2C1F4D',
  white:        '#FFFFFF',
  sheetInk:     '#0D2480',
  black:        '#000000',
  onPrimary:    '#FFFFFF',
  onPrimaryStrong: 'rgba(255,255,255,0.9)',
  onPrimarySoft:   'rgba(255,255,255,0.92)',
  onPrimaryMuted:  'rgba(255,255,255,0.92)',
  onPrimaryLine:   'rgba(255,255,255,0.35)',
  onPrimaryFill:   'rgba(30,16,51,0.18)',
  overlay:      'rgba(0,0,0,0.6)',
  overlayLight: 'rgba(0,0,0,0.5)',
  tourScrim:    'rgba(0,0,0,0.72)',
  medalGold:    '#E0A800',
  medalSilver:  '#90A4AE',
  medalBronze:  '#B7793A',
  time:         '#2C1F4D',
  timeBorder:   '#45336F',
  timeInk:      '#E2D8FF',
  timeText:     '#C4B0FF',
  announcementHighlight: '#2C1F4D',
  coverOpen:       '#6D28D9',
  coverTournament: '#BE185D',
}

export const theme = {
  colors: (colorScheme === 'dark' ? darkColors : lightColors) as typeof lightColors,
  /** Gradient stops for `LinearGradient colors={...}`. */
  gradients: {
    brand: ['#4FC3F7', '#7C4DFF', '#E040FB'] as const,
  },
  /** Font family names registered via @expo-google-fonts (native + web). */
  fonts: {
    // Party invite (Nov 2026): Outfit everywhere; display is its ExtraBold.
    display:         'Outfit_800ExtraBold',
    displaySemiBold: 'Outfit_700Bold',
    displayMedium:   'Outfit_600SemiBold',
    body:            'Outfit_400Regular',
    bodyMedium:      'Outfit_500Medium',
    bodySemiBold:    'Outfit_600SemiBold',
    bodyBold:        'Outfit_700Bold',
  },
  spacing: {
    xxs: 2,
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },
  font: {
    size: {
      // xs is the floor: nothing in the app renders below 11 (iOS Caption 2, Material Label Small)
      xs:  11,
      sm:  12,
      smd: 13,
      md:  14,
      lgs: 15,
      /** Inputs on web: below 16 iOS Safari zooms the page on focus. */
      base: 16,
      lgm: 17,
      lg:  18,
      xl:  24,
      xxl: 32,
    },
    /** Display type (Space Grotesk titles, big numbers). */
    heading: {
      sm:     20,
      md:     22,
      lg:     26,
      xl:     28,
      xxl:    34,
      hero:   44,
      splash: 48,
      /** Simple score's big point numbers. */
      scoreboard: 96,
    },
    /** Emoji used as pictures (empty states, medals, pickers). */
    emoji: {
      xs:    18,
      sm:    20,
      md:    22,
      lg:    24,
      xl:    28,
      xxl:   36,
      hero:  48,
      giant: 64,
    },
    /** Faint decorative glyphs behind card content (clipped by their card). */
    watermark: {
      sm: 80,
      md: 110,
      lg: 120,
      xl: 140,
    },
    weight: {
      regular:  '400' as const,
      medium:   '500' as const,
      semibold: '600' as const,
      bold:     '700' as const,
    },
    lineHeight: {
      tight:   20,
      normal:  24,
      relaxed: 30,
    },
  },
  // Party invite shapes: soft, generous corners (cards 20, sheets 28), pills for buttons.
  radius: {
    sm:   10,
    md:   16,
    lg:   20,
    xl:   24,
    /** Top corners of bottom sheets. */
    sheet: 28,
    xxl:  28,
    full: 999,
  },
  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    /** Cards: they sit on the page without an outline, lifted by a soft plum shadow. */
    card: {
      shadowColor: '#1E1033',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
  },
}

export type Theme = typeof theme

/**
 * Club tiles (Clubs tab): saturated fills that carry white initials in both themes
 * (the same in light and dark, like the feed covers). Picked per club from its name.
 */
export const CLUB_TILE_COLORS: readonly string[] = ['#7C3AED', '#DB2777', '#0891B2', '#EA580C', '#15803D', '#4F46E5', '#B45309', '#0F766E']
