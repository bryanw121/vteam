import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { EmptyState, ScreenState } from '../../../../components/ui'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useUserSettings } from '../../../../hooks/useUserSettings'
import { useHiddenFeed } from '../../../../hooks/useHiddenFeed'
import { shared, theme } from '../../../../constants'
import { HIDDEN_FEED_GROUPS, pruneHidden } from '../../../../utils/hiddenFeed'
import { formatEventDate } from '../../../../utils'

/**
 * Settings → Hidden in feed: everything the player hid from the Events feed,
 * grouped by what it covers, each with Unhide. Hiding happens from a feed
 * card's ⋯ menu.
 */
export default function HiddenFeedScreen() {
  useStackBackTitle('Hidden in feed')
  const { isLoading, error } = useUserSettings()
  const { entries, unhide, restore } = useHiddenFeed()
  const visible = useMemo(() => pruneHidden(entries), [entries])
  const groups = HIDDEN_FEED_GROUPS
    .map(group => ({ ...group, rows: visible.filter(e => e.kind === group.kind) }))
    .filter(group => group.rows.length > 0)

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: 32 }]}>
        <ScreenState
          loading={isLoading}
          ready={!isLoading || entries.length > 0}
          error={error && entries.length === 0 ? 'Could not load what you hid. Please try again.' : null}
        >
          <>
            <Text style={[shared.caption, styles.intro]}>
              These don't show in your Events feed. Events you're going to or hosting always show.
              To hide something, tap ⋯ on its card.
            </Text>
            {groups.length === 0 ? (
              <EmptyState
                icon="eye-outline"
                title="Nothing hidden"
                body="Tap ⋯ on a card in the Events feed to hide a session, a venue, a host or a type of game."
                testID="hidden-feed-empty"
              />
            ) : (
              <>
                {groups.map(group => (
                  <View key={group.kind} style={styles.group}>
                    <Text style={styles.groupTitle} accessibilityRole="header">{group.title}</Text>
                    <View style={[shared.card, styles.card]}>
                      {group.rows.map((row, idx) => (
                        <View
                          key={`${row.kind}|${row.key}`}
                          style={[styles.row, idx < group.rows.length - 1 && styles.rowDivider]}
                          testID="hidden-feed-row"
                        >
                          <View style={styles.rowText}>
                            <Text style={styles.rowLabel} numberOfLines={2}>{row.label}</Text>
                            {row.kind === 'item' && row.until ? (
                              <Text style={shared.caption} numberOfLines={1}>{formatEventDate(row.until)}</Text>
                            ) : null}
                          </View>
                          <Pressable
                            onPress={() => unhide(row)}
                            accessibilityRole="button"
                            accessibilityLabel={`Unhide ${row.label}`}
                            hitSlop={6}
                            style={({ pressed }) => [styles.unhide, pressed && styles.pressed]}
                            testID="hidden-feed-unhide"
                          >
                            <Text style={styles.unhideLabel}>Unhide</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
                <Pressable
                  onPress={() => restore([])}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
                  testID="hidden-feed-clear"
                >
                  <Text style={styles.clearLabel}>Unhide everything</Text>
                </Pressable>
              </>
            )}
          </>
        </ScreenState>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  intro: { marginBottom: theme.spacing.md },
  group: { marginBottom: theme.spacing.lg },
  groupTitle: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.colors.subtext,
    marginBottom: theme.spacing.sm,
  },
  card: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 56,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text },
  unhide: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    minHeight: 40,
    justifyContent: 'center',
  },
  unhideLabel: { fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.timeInk },
  clear: { alignSelf: 'center', paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg, minHeight: 44 },
  clearLabel: { fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext },
  pressed: { opacity: 0.75 },
})
