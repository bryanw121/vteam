import { StyleSheet } from 'react-native'
import { theme } from '../../constants'

/** Styles shared by the tournament tab components (kept local to the feature). */
export const ts = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    color: theme.colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted13: { fontSize: theme.font.size.smd, color: theme.colors.subtext },
  centeredEmpty: { alignItems: 'center', paddingVertical: 60 },
  emptyCaption: { fontSize: theme.font.size.md, color: theme.colors.subtext, marginTop: 12, textAlign: 'center' },
  miniButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  miniButtonLabel: { fontSize: theme.font.size.sm },
})
