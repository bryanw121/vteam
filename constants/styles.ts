import { Platform, StyleSheet } from 'react-native'
import { theme } from './theme'

const { colors, spacing, font, radius, shadow, fonts } = theme

export const shared = StyleSheet.create({

  // ─── Layout ───────────────────────────────────────────────
  screen:        { flex: 1, backgroundColor: colors.background },
  screenPadded:  { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row:           { flexDirection: 'row', alignItems: 'center' },
  rowBetween:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scrollContent: { padding: spacing.lg },
  /** Stack subpages (settings, etc.): less space under the nav header than full scrollContent. */
  scrollContentSubpage: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xxs,
  },

  // ─── Cards ────────────────────────────────────────────────
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },

  // ─── Typography ───────────────────────────────────────────
  heading:      { fontFamily: theme.fonts.display,       fontSize: font.size.xl,  color: colors.text },
  subheading:   { fontFamily: theme.fonts.displaySemiBold, fontSize: font.size.lg,  color: colors.text },
  body:         { fontFamily: theme.fonts.body,           fontSize: font.size.md,  color: colors.text, lineHeight: font.lineHeight.normal },
  caption:      { fontFamily: theme.fonts.body,           fontSize: font.size.sm,  color: colors.subtext },
  label:        { fontFamily: theme.fonts.bodyMedium,     fontSize: font.size.sm,  color: colors.subtext, marginBottom: spacing.xs },
  primaryText:  { fontFamily: theme.fonts.bodyMedium,     fontSize: font.size.md,  color: colors.primary },
  errorText:    { fontFamily: theme.fonts.body,           fontSize: font.size.sm,  color: colors.error, marginTop: spacing.xs },

  // ─── Inputs ───────────────────────────────────────────────
  input: {
    fontFamily: theme.fonts.body,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.size.md,
    color: colors.text,
  },
  inputMultiline:  { height: 100, textAlignVertical: 'top' },
  inputError:      { borderColor: colors.error },
  inputErrorText:  { fontSize: font.size.sm, color: colors.error, marginTop: spacing.xs },
  inputContainer:  { marginBottom: spacing.md },

  // ─── Buttons ──────────────────────────────────────────────
  buttonBase:         { padding: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary:      { backgroundColor: colors.primary },
  buttonSecondary:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  buttonDanger:       { backgroundColor: colors.error },
  buttonDisabled:     { opacity: 0.5 },
  buttonLabelPrimary: { fontFamily: theme.fonts.bodySemiBold, color: colors.white,   fontSize: font.size.md },
  buttonLabelSecondary: { fontFamily: theme.fonts.bodySemiBold, color: colors.primary, fontSize: font.size.md },

  // ─── Badges ───────────────────────────────────────────────
  badge:     { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeFull: { backgroundColor: colors.error },
  badgeText: { color: colors.white, fontSize: font.size.sm, fontWeight: font.weight.semibold },

  // ─── Auth ─────────────────────────────────────────────────
  authBackground: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  authCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    ...shadow.md,
  },
  authTitle:    { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.primary, marginBottom: spacing.xs, textAlign: 'center' },
  authSubtitle: { fontSize: font.size.md, color: colors.subtext, marginBottom: spacing.xl, textAlign: 'center' },
  authLink:     { marginTop: spacing.md, alignItems: 'center' },
  authLinkText: { color: colors.primary, fontSize: font.size.md },
  authLinkSubtle: { color: colors.subtext, fontSize: font.size.md },

  // ─── Divider ──────────────────────────────────────────────
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  // ─── Pickers (create event) ───────────────────────────────
  pickerBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pickerRow:     { flexDirection: 'row', alignItems: 'center' },
  pickerItem:    { alignItems: 'flex-start', gap: spacing.xs },
  pickerLabel:   { fontSize: font.size.xs, fontWeight: font.weight.medium, color: colors.subtext },
  pickerDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  // ─── Stepper (create event) ───────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stepperBtn:         { width: 56, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  stepperBtnDisabled: { opacity: 0.3 },
  stepperBtnText:     { fontSize: font.size.xl, color: colors.primary, fontWeight: font.weight.medium },
  stepperValue:       { flex: 1, textAlign: 'center', fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.text },

  // ─── Attendee row (event detail) ──────────────────────────
  attendeeRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  removeButton:   { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error },
  removeText:     { color: colors.error, fontSize: font.size.sm, fontWeight: font.weight.medium },

  // ─── Event card ───────────────────────────────────────────
  eventCardTitle: { flex: 1, marginRight: spacing.sm },
  eventCard:      { marginBottom: spacing.md },

  // ─── Tags ─────────────────────────────────────────────────
  tag:     { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.primary + '18', borderWidth: 1, borderColor: colors.primary + '40' },
  tagText: { fontSize: font.size.xs, fontWeight: font.weight.medium, color: colors.primary },

  // ─── Floating actions ─────────────────────────────────────
  floatingButtonWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  scrollContentWithFloatingButton: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + spacing.xl,
  },

  // ─── Modal ────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 320,
    width: '85%',
    ...shadow.md,
  },
  modalEmoji:    { fontSize: theme.font.emoji.hero },
  modalTitle:    { fontSize: font.size.lg, fontWeight: font.weight.bold,   color: colors.text,    textAlign: 'center' },
  modalBody:     { fontSize: font.size.sm, fontWeight: font.weight.regular, color: colors.subtext, textAlign: 'center' },
  modalButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  modalButtonText: { color: colors.white, fontWeight: font.weight.medium, fontSize: font.size.md },

  // ─── Spacing helpers ──────────────────────────────────────
  mb_xs: { marginBottom: spacing.xs },
  mb_sm: { marginBottom: spacing.sm },
  mb_md: { marginBottom: spacing.md },
  mb_lg: { marginBottom: spacing.lg },
  mb_xl: { marginBottom: spacing.xl },
  mt_xs: { marginTop: spacing.xs },
  mt_sm: { marginTop: spacing.sm },
  mt_md: { marginTop: spacing.md },
  mt_lg: { marginTop: spacing.lg },
  mt_xl: { marginTop: spacing.xl },

  // ─── Team / player grid (shared by the event People & Cheers tabs) ───────
  playerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  playerCell: { width: Platform.OS === 'web' ? '33.33%' : '50%', padding: 3 },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  teamHeading: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  /** One bordered player/guest row (drag card in People, cheer card in Cheers). */
  playerCardShell: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  playerCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerCardAvatarInitial: {
    fontSize: theme.font.size.smd,
    fontWeight: font.weight.bold,
    letterSpacing: 0.5,
  },
  playerCardName: {
    fontSize: font.size.md,
    fontWeight: font.weight.medium,
    color: colors.text,
  },

  // ─── Update required screen ───────────────────────────────────────────────
  // ── External session card (Schelagg sessions in the Events feed) ─────────
  // TimePill: event start time, its own high-contrast colour
  timePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.time,
    borderWidth: 1, borderColor: theme.colors.timeBorder,
  },
  timePillLabel: {
    fontFamily: theme.fonts.bodySemiBold, fontWeight: '800', fontSize: theme.font.size.lgs,
    color: theme.colors.timeInk, letterSpacing: -0.2,
  },
  timePillLabelLg: { fontSize: theme.font.size.lgm },
  externalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  externalDateBlock: {
    width: 56,
    flexShrink: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  externalDay: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: font.size.xs,
    letterSpacing: 1,
  },
  externalDate: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.heading.xl,
    lineHeight: 30,
    letterSpacing: -1.2,
  },
  externalBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  externalKicker: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.subtext,
  },
  externalTitle: {
    fontFamily: theme.fonts.displaySemiBold,
    fontSize: theme.font.size.lg,
    color: theme.colors.text,
  },
  externalMeta: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },
  externalSignup: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.xs,
    minHeight: 32,
    paddingHorizontal: theme.spacing.sm + 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
  },
  /** What the last-mile check found: a new time (warning) or cancelled / gone (error). */
  externalFinding: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.sm,
    color: theme.colors.warning,
    marginTop: theme.spacing.xxs,
  },
  externalFindingCanceled: { color: theme.colors.error },
  externalSignupLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.sm,
    color: theme.colors.text,
  },
  // ── Guest mode (SignInPrompt, SignInButton) ──────────────────────────────
  signInPromptContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  signInPromptIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  signInPromptTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.size.xl,
    color: theme.colors.text,
    textAlign: 'center',
  },
  signInPromptBody: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.md,
    lineHeight: theme.font.lineHeight.tight,
    color: theme.colors.subtext,
    textAlign: 'center',
    maxWidth: 320,
  },
  signInPromptActions: {
    width: '100%',
    maxWidth: 320,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  signInButton: {
    minHeight: 38,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.md,
    color: theme.colors.white,
  },
  updateRequiredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.sm,
  },
  updateRequiredTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.size.xl,
    color: theme.colors.text,
    textAlign: 'center',
  },
  updateRequiredBody: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.md,
    color: theme.colors.text,
    textAlign: 'center',
    maxWidth: 360,
  },
  updateRequiredVersion: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },

  // ═══ UI primitives (components/ui) ═══════════════════════════════════════
  // Values are lifted from the hand-built versions in the screens so adopting
  // a primitive in Phase B does not change how anything looks.

  // ── Button extensions ─────────────────────────────────────
  buttonGhost:        { backgroundColor: 'transparent' },
  buttonSm:           { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  /** Toolbar button: sm padding, ≥44pt touch target (CLAUDE.md UI rule). */
  buttonTouch:        { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 44 },
  buttonAuto:         { alignSelf: 'flex-start' },
  buttonWithIcon:     { flexDirection: 'row', gap: spacing.xs + 2 },
  buttonLabelSm:      { fontSize: font.size.smd },

  // ── Chip (feed filter chips) ──────────────────────────────
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive:      { backgroundColor: colors.primary, borderColor: colors.primary },
  /** Clubs-style active state: 14% primary wash instead of a solid fill. */
  chipActiveTint:  { backgroundColor: colors.primary + '24', borderColor: colors.primary },
  chipLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.smd,
    fontWeight: font.weight.semibold,
    color: colors.subtextStrong,
  },
  chipLabelActive:     { color: colors.onPrimary },
  chipLabelActiveTint: { color: colors.primary },

  // ── IconButton (notifications bell, etc.) ─────────────────
  iconButton: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.hot,
    borderWidth: 1.5,
    borderColor: colors.card,
  },

  // ── ScreenHeader ──────────────────────────────────────────
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.sm,
  },
  screenHeaderText:  { flexShrink: 1 },
  screenHeaderKicker: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    letterSpacing: 1.2,
    color: colors.subtext,
    textTransform: 'uppercase',
  },
  screenHeaderTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.heading.xxl,
    lineHeight: 34,
    letterSpacing: -1.2,
    color: colors.text,
    marginTop: 2,
  },
  screenHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  screenHeaderBack:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginLeft: spacing.lg, marginTop: spacing.sm },
  screenHeaderBackLabel: { fontFamily: theme.fonts.body, fontSize: font.size.sm, color: colors.primary },

  // ── EmptyState / ScreenState ──────────────────────────────
  emptyState:       { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyStateBody:   { textAlign: 'center', maxWidth: 320 },
  emptyStateAction: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  // EventDetailSkeleton: placeholders in the event page's final layout
  skeletonBlock: { backgroundColor: theme.colors.card, borderRadius: 16 },
  /** "Load earlier comments" at the top of a discussion: full-width, 44pt touch target. */
  loadEarlierButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.xs,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'manipulation' } as object) : null),
  },
  loadEarlierLabel: { fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.primary },
  /** Host form while a cold edit link loads: one field-shaped block. */
  skeletonField: { height: 48, borderRadius: 12, backgroundColor: theme.colors.card },
  skeletonLabel: { width: 96, height: 10, borderRadius: 5, backgroundColor: theme.colors.card, marginBottom: 8 },
  /** Chat (web): "New messages" pill over the list while scrolled up. */
  chatNewMessagesPill: {
    position: 'absolute', bottom: theme.spacing.md, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44,
    paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary, ...theme.shadow.md,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'manipulation' } as object) : null),
  },
  chatNewMessagesLabel: { fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.onPrimary },
  chatListEdge: { alignItems: 'center', justifyContent: 'center', minHeight: theme.spacing.md, paddingVertical: theme.spacing.xs },
  skeletonHero: {
    marginHorizontal: theme.spacing.md, marginTop: theme.spacing.xs, marginBottom: theme.spacing.sm,
    height: 128, borderRadius: 22, backgroundColor: theme.colors.card,
  },
  skeletonTabs: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    height: 44, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  skeletonTab: { width: 56, height: 10, borderRadius: 5, backgroundColor: theme.colors.card },
  // RefreshControl.web: pull-to-refresh wrapper and its spinner
  pullWrapper: { position: 'relative' },
  // DocPullToRefresh: zero-size in-flow anchor; its indicator is pinned to the viewport
  pullAnchor: { height: 0, overflow: 'visible' },
  pullIndicatorFixed: { position: 'fixed' as 'absolute', top: 0, left: '50%', marginLeft: -18, alignSelf: undefined },
  pullIndicator: {
    position: 'absolute', top: 0, alignSelf: 'center', zIndex: 10,
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border,
  },
  screenStateCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  screenStateSpinner: { marginTop: spacing.xl },

  // ── ConfirmDialog ─────────────────────────────────────────
  /** Centering wrapper; the scrim is a sibling Pressable (see ConfirmDialog) so it can be tapped to dismiss. */
  modalOverlayPlain: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dialogCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: 320,
    maxWidth: '92%',
    gap: spacing.md,
    zIndex: 1,
  },
  dialogTitle:   { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.text },
  dialogBody:    { fontSize: font.size.sm, color: colors.subtext },
  dialogActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  dialogAction:  { flex: 1 },

  // ── BottomSheet ───────────────────────────────────────────
  sheetRoot:     { flex: 1, justifyContent: 'flex-end' },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontFamily: theme.fonts.displaySemiBold,
    fontSize: font.size.lg,
    color: colors.text,
    marginBottom: spacing.md,
  },
  /** One tappable row in an action sheet (People-tab ⋯ menu). 44pt minimum. */
  sheetOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  sheetOptionActive:      { backgroundColor: colors.background },
  sheetOptionText:        { fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.text },
  sheetOptionDestructive: { color: colors.error },
  /** Glyph-only corner trigger on a roster card (⋯): the icon stays small, the hit area is 44pt. */
  rowMenuTrigger: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Wrapping row of Chips (forms) ─────────────────────────
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xs },
  // Settings → Notifications: example of the reminder a player will get.
  reminderPreview: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
  },
  reminderPreviewTitle: { fontFamily: theme.fonts.bodySemiBold, fontWeight: '600', fontSize: theme.font.size.md, color: theme.colors.text },
  // Secondary text on settings cards and in the inbox: `caption`/`label` in a colour that passes WCAG AA there.
  captionStrong: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtextStrong },
  labelStrong: { fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.sm, color: theme.colors.subtextStrong, marginBottom: theme.spacing.xs },

  // ── One-time banner (components/ui/OneTimeBanner) ────────
  oneTimeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    paddingRight: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.card,
  },
  oneTimeBannerText: { flex: 1, paddingVertical: theme.spacing.sm, gap: theme.spacing.xxs },
  oneTimeBannerTitle: { color: theme.colors.text, fontSize: theme.font.size.smd, fontFamily: theme.fonts.bodySemiBold },
  oneTimeBannerBody: { color: theme.colors.subtext, fontSize: theme.font.size.sm, fontFamily: theme.fonts.body, lineHeight: 18 },
  /** The banner's link (e.g. "Check out our tour"): text-styled, but a full 44pt touch target. */
  oneTimeBannerAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: -theme.spacing.xs, marginBottom: -theme.spacing.sm },
  oneTimeBannerActionText: { color: theme.colors.primary, fontSize: theme.font.size.smd, fontFamily: theme.fonts.bodySemiBold, textDecorationLine: 'underline' },

  // ── Guided tour overlay (components/tour/TourOverlay) ─────
  tourRoot: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  tourScrim: { position: 'absolute', backgroundColor: theme.colors.tourScrim },
  tourRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
  },
  tourCard: {
    position: 'absolute',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}),
  },
  tourArrow: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    transform: [{ rotate: '45deg' }],
  },
  tourArrowUp: { top: -7, borderTopWidth: 1, borderLeftWidth: 1 },
  tourArrowDown: { bottom: -7, borderBottomWidth: 1, borderRightWidth: 1 },
  tourCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  tourProgress: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  tourDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.border },
  tourDotActive: { width: 16, backgroundColor: theme.colors.primary },
  tourStepCount: { marginLeft: theme.spacing.xs, color: theme.colors.subtext, fontSize: theme.font.size.sm, fontFamily: theme.fonts.bodyMedium },
  tourSkip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', marginRight: -theme.spacing.xs, paddingHorizontal: theme.spacing.xs },
  tourSkipText: { color: theme.colors.subtext, fontSize: theme.font.size.md, fontFamily: theme.fonts.bodyMedium },
  tourTitle: { color: theme.colors.text, fontSize: theme.font.size.lg, fontFamily: theme.fonts.display, letterSpacing: -0.2 },
  tourBody: { color: theme.colors.subtext, fontSize: theme.font.size.md, fontFamily: theme.fonts.body, lineHeight: 20 },
  tourActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.sm },

  // ── Events feed: refresh failed, showing older events ─────
  feedStaleNotice: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.card,
  },
  /** Mobile: the notice sits outside the padded list column. */
  feedStaleNoticeMobile: { marginHorizontal: theme.spacing.lg },
  feedStaleNoticeText: { color: theme.colors.warning, fontSize: theme.font.size.sm, fontFamily: theme.fonts.bodyMedium },

  // ── Create (+) menu (components/CreateMenuList) ──────────
  createMenuOverlay: { gap: theme.spacing.md, alignItems: 'flex-end' },
  createMenuPanel: {
    gap: theme.spacing.md,
    alignItems: 'stretch',
    minWidth: 220,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    ...theme.shadow.md,
  },
  createMenuSection: { gap: theme.spacing.sm },
  createMenuCaption: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.subtext,
  },
  createMenuCaptionOverlay: { color: theme.colors.text, textAlign: 'right', paddingRight: theme.spacing.xs },
  createMenuPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 44,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  createMenuPillOverlay: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.fabMenuChip,
    borderColor: theme.colors.fabMenuChipBorder,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  createMenuPillPanel: { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
  createMenuLabel: { fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text },

  // ── Book a court (app/(app)/book.tsx, components/book) ─────
  /** Lines up with ScreenHeader's own lg inset. */
  bookContent: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md },
  bookIntro: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.md,
    lineHeight: 20,
    color: theme.colors.subtext,
  },
  bookDayStrip: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xxs },
  bookDay: {
    width: 58,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'manipulation' } as object) : null),
  },
  bookDayActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  bookDayDow: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    letterSpacing: 0.4,
    color: theme.colors.subtext,
  },
  bookDayDate: { fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text },
  bookDayTextActive: { color: theme.colors.onPrimary },
  bookDayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  bookDayDotFree: { backgroundColor: theme.colors.cool },
  bookDayDotOnActive: { backgroundColor: theme.colors.onPrimary },
  bookChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  bookFreshness: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs + 2 },
  bookFreshnessOld: {
    padding: theme.spacing.sm + 2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.card,
  },
  bookFreshnessText: { flex: 1, fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, lineHeight: 17, color: theme.colors.subtext },
  bookFreshnessTextOld: { color: theme.colors.warning, fontFamily: theme.fonts.bodyMedium },
  bookError: {
    gap: theme.spacing.xxs,
    padding: theme.spacing.sm + 2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.card,
  },
  bookErrorText: { fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.sm, color: theme.colors.error },
  bookDayHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  bookDayHeadingText: { fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lg, color: theme.colors.text },
  bookLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  bookLegendItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  bookLegendSwatch: { width: 14, height: 10, borderRadius: 3 },
  bookLegendFree: { backgroundColor: theme.colors.cool + '33' },
  bookLegendBooked: { backgroundColor: theme.colors.error },
  bookLegendClosed: { backgroundColor: theme.colors.borderSoft },
  bookLegendNow: { width: 2, height: 12, backgroundColor: theme.colors.hot },
  bookLegendText: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
  bookFacility: {
    gap: theme.spacing.sm + 2,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  bookFacilityHead: { gap: theme.spacing.xs + 2 },
  bookFacilityName: { fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lg, color: theme.colors.text },
  bookMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.xs + 2 },
  bookMetaText: { flexShrink: 1, fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  bookPill: { paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.full },
  bookPillText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, letterSpacing: 0.3 },
  bookPillPrice: { backgroundColor: theme.colors.primarySoft },
  bookPillPriceText: { color: theme.colors.text },
  bookPillWarn: { borderWidth: 1, borderColor: theme.colors.warning },
  bookPillWarnText: { color: theme.colors.warning },
  bookSummary: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, lineHeight: 20 },
  bookSummaryFree: { color: theme.colors.cool },
  bookSummaryNone: { color: theme.colors.subtext },
  bookGrid: { flexDirection: 'row' },
  bookGridLabels: { width: 72, flexShrink: 0, paddingRight: theme.spacing.sm },
  bookGridLabelRow: { justifyContent: 'center' },
  bookGridLabel: { fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.xs, color: theme.colors.text },
  bookGridScroll: { flex: 1 },
  bookGridHint: { marginTop: theme.spacing.xxs, textAlign: 'right', fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
  bookActions: { gap: theme.spacing.xs + 2, marginTop: theme.spacing.xxs },
  bookNote: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, lineHeight: 17, color: theme.colors.subtext },
  bookFollowUp: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
    minHeight: 44,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'manipulation' } as object) : null),
  },
  bookFollowUpText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.primary },
  bookFootnote: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, lineHeight: 16, color: theme.colors.subtext },

  // ── ScreenContainer ───────────────────────────────────────
  screenContainerWide:  { flex: 1, alignItems: 'center' },
  screenContainerInner: { flex: 1, width: '100%' },

  // ── Legal pages (/terms, /privacy) and the sign-up agreement line ──────
  legalBody:        { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  legalUpdated:     { fontFamily: fonts.body, fontSize: font.size.sm, color: colors.subtext },
  legalHeading:     { fontFamily: fonts.displaySemiBold, fontSize: font.size.lg, color: colors.text, marginTop: spacing.md },
  legalText:        { fontFamily: fonts.body, fontSize: font.size.lgs, lineHeight: 23, color: colors.text },
  legalBold:        { fontFamily: fonts.bodySemiBold },
  legalPlaceholder: { fontFamily: fonts.bodyMedium, color: colors.warning, backgroundColor: colors.warning + '22' },
  legalListItem:    { flexDirection: 'row', gap: spacing.sm, paddingLeft: spacing.xs },
  legalBullet:      { fontFamily: fonts.body, fontSize: font.size.lgs, lineHeight: 23, color: colors.primary },
  legalTableRow:    { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  legalTableLabel:  { fontFamily: fonts.bodyMedium, fontSize: font.size.sm, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  agreementLine:    { fontFamily: fonts.body, fontSize: font.size.xs, lineHeight: 16, color: colors.subtext, textAlign: 'center', marginTop: spacing.md },
  agreementLink:    { color: colors.primary, textDecorationLine: 'underline' },

  // Settings → Display (text size)
  settingsOptionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  settingsOptionRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  settingsOptionLabel:     { flex: 1, fontFamily: fonts.bodyMedium, fontSize: font.size.md, color: colors.subtext },
  settingsPreviewBubble: {
    alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.primary,
    borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  settingsPreviewBubbleText: { fontFamily: fonts.body, fontSize: font.size.md, color: colors.onPrimary },
})
