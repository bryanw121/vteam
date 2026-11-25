import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme, TIGHT_TEXT_SCALE } from '../../constants'
import type { SettingsSection } from '../../utils/routes'

type Props = {
  onOpen: (section: SettingsSection) => void
  /** "Take the tour" row: restarts the intro tour. */
  onTakeTour: () => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
  /** Pending incoming friend requests, shown as a count on the Friends row. */
  friendRequestCount?: number
  /**
   * Admins get an Admin metrics row, last: the admin check answers after the rest of Profile,
   * and a group drawn above the others then pushed the whole menu down (a visible jump on refresh).
   * Drawing it is cosmetic: every metrics read checks on the server.
   */
  showAdmin?: boolean
}

type IconName = ComponentProps<typeof Ionicons>['name']

/** Icon colour per row, so the groups read at a glance (hue tokens that hold up in dark). */
type Tone = 'primary' | 'cool' | 'hot' | 'warning' | 'sub'

/** A row opens a settings screen (`section`) or runs one of the callbacks (`action`). */
type MenuRow = { title: string; icon: IconName; tone: Tone } & (
  | { section: SettingsSection }
  | { action: 'tour' | 'terms' | 'privacy' }
)

type MenuGroup = { title: string; rows: readonly MenuRow[] }

/** The Profile tab's shortcuts: what you did first, then settings, then help. */
const MENU_GROUPS: readonly MenuGroup[] = [
  {
    title: 'Your games',
    rows: [
      { title: 'Games I played', icon: 'time-outline', tone: 'primary', section: 'history' },
      { title: 'Friends', icon: 'people-outline', tone: 'cool', section: 'friends' },
      { title: 'Cheers', icon: 'star-outline', tone: 'hot', section: 'cheers' },
      { title: 'Badges', icon: 'ribbon-outline', tone: 'warning', section: 'badges' },
    ],
  },
  {
    title: 'Settings',
    rows: [
      { title: 'Notifications', icon: 'notifications-outline', tone: 'primary', section: 'notifications' },
      { title: 'Display', icon: 'contrast-outline', tone: 'primary', section: 'display' },
      { title: 'Hidden in feed', icon: 'funnel-outline', tone: 'primary', section: 'hidden' },
      { title: 'Silenced people', icon: 'eye-off-outline', tone: 'primary', section: 'silenced' },
      { title: 'Account settings', icon: 'settings-outline', tone: 'primary', section: 'account' },
      { title: 'Go ad-free', icon: 'sparkles-outline', tone: 'warning', section: 'ad-free' },
      { title: 'Experiments', icon: 'flask-outline', tone: 'cool', section: 'experimental' },
    ],
  },
  {
    title: 'Help',
    rows: [
      { title: 'Take the tour', icon: 'compass-outline', tone: 'sub', action: 'tour' },
      { title: 'Help & feedback', icon: 'chatbubble-ellipses-outline', tone: 'sub', section: 'feedback' },
      { title: 'Terms and Conditions', icon: 'document-text-outline', tone: 'sub', action: 'terms' },
      { title: 'Privacy Policy', icon: 'shield-checkmark-outline', tone: 'sub', action: 'privacy' },
    ],
  },
]

const TONE_COLOR: Record<Tone, string> = {
  primary: theme.colors.primaryText,
  cool: theme.colors.cool,
  hot: theme.colors.hot,
  warning: theme.colors.warning,
  sub: theme.colors.subtext,
}

/** Only for accounts in app_admins. */
const ADMIN_GROUP: MenuGroup = {
  title: 'Admin',
  rows: [{ title: 'Admin metrics', icon: 'stats-chart-outline', tone: 'sub', section: 'metrics' }],
}

const rowKey = (row: MenuRow) => ('section' in row ? row.section : row.action)

/** The settings shortcuts under the profile hero, in labelled groups. Navigation is the caller's (`onOpen`). */
export function ProfileMenu({ onOpen, onTakeTour, onOpenTerms, onOpenPrivacy, friendRequestCount = 0, showAdmin = false }: Props) {
  const actions = { tour: onTakeTour, terms: onOpenTerms, privacy: onOpenPrivacy }
  const groups = showAdmin ? [...MENU_GROUPS, ADMIN_GROUP] : MENU_GROUPS
  return (
    <View style={styles.groups}>
      {groups.map(group => (
        <View key={group.title}>
          <Text style={styles.groupTitle} accessibilityRole="header">{group.title}</Text>
          <View style={[shared.card, styles.card]}>
            {group.rows.map((row, idx) => {
              const key = rowKey(row)
              return (
                <Pressable
                  key={key}
                  onPress={'section' in row ? () => onOpen(row.section) : actions[row.action]}
                  accessibilityRole="button"
                  accessibilityLabel={row.title}
                  testID={key === 'tour' ? 'take-tour' : `profile-menu-${key}`}
                  style={({ pressed }) => [
                    styles.row,
                    idx < group.rows.length - 1 && styles.rowBorder,
                    pressed && { backgroundColor: theme.colors.background },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: TONE_COLOR[row.tone] + '1F' }]}>
                    <Ionicons name={row.icon} size={18} color={TONE_COLOR[row.tone]} />
                  </View>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  {key === 'friends' && friendRequestCount > 0 && (
                    <View style={styles.countPip} accessibilityLabel={`${friendRequestCount} friend ${friendRequestCount === 1 ? 'request' : 'requests'}`} testID="profile-menu-friends-count">
                      <Text style={styles.countText} maxFontSizeMultiplier={TIGHT_TEXT_SCALE}>{friendRequestCount > 9 ? '9+' : friendRequestCount}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  groups: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  groupTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.size.lg,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  card: {
    gap: 0,
    padding: 0,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.card,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPip: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: theme.font.size.xs,
    color: theme.colors.white,
  },
  rowTitle: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.font.size.md,
    color: theme.colors.text,
  },
})
