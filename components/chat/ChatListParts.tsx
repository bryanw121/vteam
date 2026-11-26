import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { TIGHT_TEXT_SCALE, theme } from '../../constants'
import { ClubAvatarTile, InitialsTile } from '../club/ClubListParts'
import type { ConversationRow } from '../../types'

type RowProps = {
  row: ConversationRow
  title: string
  preview: string
  time: string
  /** A photo for a person (a club's picture is resolved by its tile). */
  avatarUri: string | null
  onPress: () => void
  /** Long press / right click: silence this person (DMs). */
  onSilence?: () => void
}

/** The pink count of unread messages; `conversation-unread` sums to the tab badge (e2e). */
function UnreadPip({ count }: { count: number }) {
  return (
    <View testID="conversation-unread" style={styles.pip}>
      <Text style={styles.pipText} maxFontSizeMultiplier={TIGHT_TEXT_SCALE}>{count > 99 ? '99+' : count}</Text>
    </View>
  )
}

/** A club's chat as a tile in the sideways row at the top of Chat (Party invite layout). */
export function ClubChatTile({ row, title, preview, onPress }: Omit<RowProps, 'avatarUri' | 'time' | 'onSilence'>) {
  const unread = row.unread_count ?? 0
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, ${unread} unread` : ''}`}
      testID="conversation-row"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tile, (pressed || hovered) && { opacity: 0.85 }]}
    >
      <View>
        <ClubAvatarTile club={{ name: title, avatar_url: row.club_avatar_url }} size={TILE} radius={24} />
        {unread > 0 && <View style={styles.tilePip}><UnreadPip count={unread} /></View>}
      </View>
      <Text style={styles.tileName} numberOfLines={2}>{title}</Text>
      <Text style={[styles.tileMeta, unread > 0 && styles.tileMetaUnread]} numberOfLines={1}>{preview}</Text>
    </Pressable>
  )
}

/**
 * One conversation: unread ones sit on a white card with a shadow and a pink count, read ones
 * sit flat on the page. People without a photo get their initials on their colour.
 */
export function ConversationListRow({ row, title, preview, time, avatarUri, onPress, onSilence }: RowProps) {
  const unread = row.unread_count ?? 0
  const isClub = row.type === 'club'
  return (
    <Pressable
      testID="conversation-row"
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onSilence}
      {...(Platform.OS === 'web' && onSilence
        ? { onContextMenu: (e: { preventDefault?: () => void }) => { e.preventDefault?.(); onSilence() } }
        : {})}
      delayLongPress={480}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        unread > 0 && styles.rowUnread,
        (pressed || hovered) && { opacity: 0.88 },
      ]}
    >
      {isClub
        ? <ClubAvatarTile club={{ name: title, avatar_url: row.club_avatar_url }} size={AVATAR} radius={16} />
        : <InitialsTile name={title} uri={avatarUri} size={AVATAR} radius={AVATAR / 2} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.line}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{time}</Text>
        </View>
        <View style={[styles.line, { marginTop: 2 }]}>
          <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>{preview}</Text>
          {unread > 0 && <UnreadPip count={unread} />}
        </View>
      </View>
    </Pressable>
  )
}

const TILE = 88
const AVATAR = 52

const styles = StyleSheet.create({
  tile: { width: TILE, gap: 4 },
  tilePip: { position: 'absolute', top: -4, right: -4 },
  tileName: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text, lineHeight: 17 },
  tileMeta: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
  tileMetaUnread: { fontFamily: theme.fonts.bodySemiBold, color: theme.colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 22,
  },
  rowUnread: { backgroundColor: theme.colors.card, ...theme.shadow.card },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: theme.fonts.displayMedium, fontSize: theme.font.size.md, color: theme.colors.text },
  nameUnread: { fontFamily: theme.fonts.display },
  time: { flexShrink: 0, fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
  timeUnread: { fontFamily: theme.fonts.bodySemiBold, color: theme.colors.primaryText },
  preview: { flex: 1, fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  previewUnread: { fontFamily: theme.fonts.bodyMedium, color: theme.colors.text },
  pip: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.hot,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pipText: { fontFamily: theme.fonts.bodyBold, fontSize: theme.font.size.xs, color: theme.colors.white },
})
