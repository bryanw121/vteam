export const theme = {
  colors: {
    // Brand
    primary:      '#7C4DFF',   // slightly brighter violet — pops on dark bg
    primaryDark:  '#5A2BFF',
    primarySoft:  '#2A1F6B',   // dark violet tint for soft chip bgs
    // Accent — electric sky blue
    accent:       '#3DC9F5',
    accentInk:    '#002A36',
    // Surfaces
    background:   '#13111F',   // dark violet-black (~Instagram/Spotify level)
    card:         '#1E1B2E',   // elevated dark surface
    /** Create-menu pills: hair lighter than `card` so they read over a blurred feed */
    fabMenuChip:       '#26243A',
    fabMenuChipBorder: '#3A365C',
    /** Washes over `BlurView` so content recedes without going flat black */
    fabMenuBackdropDim: 'rgba(19, 17, 31, 0.42)',
    // Text
    text:         '#EDEAFF',   // near-white with violet tint
    subtext:      '#7A7699',   // muted lavender-grey
    /** Secondary text that must stay readable: at least 4.5:1 on `card` and `background`, even inside a row dimmed to 72% (a read notification). */
    subtextStrong: '#B5B1D4',
    // Borders
    border:       '#2C2848',   // dark purple border
    borderSoft:   '#211D3A',   // very subtle
    // Signal palette
    warm:         '#FF6B3D',
    hot:          '#FF2D6F',
    cool:         '#00D6B4',
    // Status
    error:        '#FF5555',
    warning:      '#FFA040',
    success:      '#00D26A',
    white:        '#FFFFFF',
    black:        '#000000',
    /** Label/icon colour on `primary`, `error` and other saturated fills. */
    onPrimary:    '#FFFFFF',
    /** Scrim behind dialogs and bottom sheets. */
    overlay:      'rgba(0,0,0,0.5)',    // shared.modalOverlay (host, feedback)
    overlayLight: 'rgba(0,0,0,0.45)',   // event detail's confirm dialogs / ConfirmDialog
    /** Dims everything but the highlighted target during a guided tour. */
    tourScrim:    'rgba(8,6,18,0.74)',
    // Podium / trophy medals
    medalGold:    '#FFD54F',
    medalSilver:  '#B0BEC5',
    medalBronze:  '#D7A86E',
    // Event start time (TimePill, join bar): a soft lavender pill, distinct from the
    // cyan day chip and on-brand without shouting.
    time:         '#2A1F6B',   // pill background
    timeBorder:   '#3E2F94',   // pill outline
    timeInk:      '#D6C9FF',   // pill icon + label
    timeText:     '#C4B2FF',   // time stated as text on a card ("You're signing up for …")
    // Misc
    announcementHighlight: '#2A1F6B',
  },
  /** Gradient stops for `LinearGradient colors={...}`. */
  gradients: {
    brand: ['#4FC3F7', '#7C4DFF', '#E040FB'] as const,
  },
  /** Font family names registered via @expo-google-fonts (native + web). */
  fonts: {
    display:         'SpaceGrotesk_700Bold',
    displaySemiBold: 'SpaceGrotesk_600SemiBold',
    displayMedium:   'SpaceGrotesk_500Medium',
    body:            'Inter_400Regular',
    bodyMedium:      'Inter_500Medium',
    bodySemiBold:    'Inter_600SemiBold',
    bodyBold:        'Inter_700Bold',
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
  radius: {
    sm:   8,
    md:   12,
    lg:   16,
    xl:   20,
    /** Top corners of bottom sheets. */
    sheet: 24,
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
  },
}

export type Theme = typeof theme
