import { StyleSheet, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { shared, theme } from '../../constants'
import type { FeedItemShellProps, HiddenCountRowProps, HideFeedSheetProps, IoniconName, HiddenFeedKind } from '../../types'

/**
 * A feed card with its "⋯" button laid over the top-right corner. The button is
 * a sibling of the card, not inside it, so the card stays one tap target (and
 * no button sits inside another on web). Cards leave room for it with `menuInset`.
 */
export function FeedItemShell({ children, onMore, moreLabel, hidden, onUnhide }: FeedItemShellProps) {
  return (
    <View>
      {hidden && (
        <View style={styles.hiddenLine} testID="feed-item-hidden">
          <Ionicons name="eye-off-outline" size={12} color={theme.colors.subtext} />
          <Text style={styles.hiddenText}>Hidden</Text>
          {onUnhide && (
            <TouchableOpacity onPress={onUnhide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Unhide" testID="feed-item-unhide">
              <Text style={styles.hiddenAction}>Unhide</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <View style={hidden ? styles.dimmed : undefined}>
        {children}
        <TouchableOpacity
          onPress={onMore}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          testID="feed-item-more"
          style={styles.more}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.subtext} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

/** "2 hidden · Show" under a day of the feed; "Hide 2 again" once shown. */
export function HiddenCountRow({ count, revealed, onToggle }: HiddenCountRowProps) {
  if (count <= 0) return null
  return (
    <TouchableOpacity
      onPress={onToggle}
      hitSlop={6}
      accessibilityRole="button"
      testID="feed-hidden-count"
      style={styles.countRow}
    >
      <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={14} color={theme.colors.subtext} />
      <Text style={styles.countText}>
        {revealed ? `Hide ${count} again` : `${count} hidden · `}
        {!revealed && <Text style={styles.countAction}>Show</Text>}
      </Text>
    </TouchableOpacity>
  )
}

const OPTION_ICONS: Record<HiddenFeedKind, IoniconName> = {
  item: 'eye-off-outline',
  venue: 'location-outline',
  host: 'person-outline',
  type: 'pricetag-outline',
}

/** The hide menu for one feed item: this item, its venue or host, its types. */
export function HideFeedSheet({ visible, itemTitle, options, onPick, onDismiss }: HideFeedSheetProps) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Hide from your feed">
      {itemTitle ? <Text style={[shared.caption, styles.sheetItem]} numberOfLines={1}>{itemTitle}</Text> : null}
      <View style={styles.sheetOptions}>
        {options.map(option => (
          <Button
            key={`${option.entry.kind}|${option.entry.key}`}
            label={option.title}
            icon={OPTION_ICONS[option.entry.kind]}
            variant="secondary"
            onPress={() => onPick(option)}
            testID={`hide-option-${option.entry.kind}`}
          />
        ))}
      </View>
      <Text style={[shared.caption, styles.sheetNote]}>
        You can see and undo everything you hide in Profile → Hidden in feed. Events you're going to or hosting always show.
      </Text>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  more: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.6 },
  hiddenLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xxs,
  },
  hiddenText: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    color: theme.colors.subtext,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hiddenAction: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    color: theme.colors.timeText,
    marginLeft: theme.spacing.xs,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  countText: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  countAction: { fontFamily: theme.fonts.bodySemiBold, color: theme.colors.timeText },
  sheetItem: { marginBottom: theme.spacing.md },
  sheetOptions: { gap: theme.spacing.sm },
  sheetNote: { marginTop: theme.spacing.md },
})
