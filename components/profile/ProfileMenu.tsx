import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import type { SettingsSection } from '../../utils/routes'

type Props = {
  onOpen: (section: SettingsSection) => void
  /** "Take the tour" row: restarts the intro tour. */
  onTakeTour: () => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
}

type IconName = ComponentProps<typeof Ionicons>['name']

/** A row opens a settings screen (`section`) or runs one of the callbacks (`action`). */
type MenuRow = { title: string; icon: IconName } & (
  | { section: SettingsSection }
  | { action: 'tour' | 'terms' | 'privacy' }
)

type MenuGroup = { title: string; rows: readonly MenuRow[] }

/** The Profile tab's settings, grouped by what people come to do. */
const MENU_GROUPS: readonly MenuGroup[] = [
  {
    title: 'Your activity',
    rows: [
      { title: 'History', icon: 'time-outline', section: 'history' },
      { title: 'Cheers', icon: 'star-outline', section: 'cheers' },
      { title: 'Badges', icon: 'ribbon-outline', section: 'badges' },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      { title: 'Notifications', icon: 'notifications-outline', section: 'notifications' },
      { title: 'Display', icon: 'text-outline', section: 'display' },
      { title: 'Silenced people', icon: 'eye-off-outline', section: 'silenced' },
    ],
  },
  {
    title: 'Account',
    rows: [
      { title: 'Account settings', icon: 'settings-outline', section: 'account' },
      { title: 'Go ad-free', icon: 'sparkles-outline', section: 'ad-free' },
    ],
  },
  {
    title: 'Help and legal',
    rows: [
      { title: 'Take the tour', icon: 'compass-outline', action: 'tour' },
      { title: 'Submit feedback', icon: 'chatbubble-ellipses-outline', section: 'feedback' },
      { title: 'Terms and Conditions', icon: 'document-text-outline', action: 'terms' },
      { title: 'Privacy Policy', icon: 'shield-checkmark-outline', action: 'privacy' },
    ],
  },
]

const rowKey = (row: MenuRow) => ('section' in row ? row.section : row.action)

/** The settings shortcuts under the profile hero, in labelled groups. Navigation is the caller's (`onOpen`). */
export function ProfileMenu({ onOpen, onTakeTour, onOpenTerms, onOpenPrivacy }: Props) {
  const actions = { tour: onTakeTour, terms: onOpenTerms, privacy: onOpenPrivacy }
  return (
    <View style={styles.groups}>
      {MENU_GROUPS.map(group => (
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
                  <View style={styles.rowIcon}>
                    <Ionicons name={row.icon} size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.rowTitle}>{row.title}</Text>
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
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  card: {
    gap: 0,
    padding: 0,
    overflow: 'hidden',
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
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.font.size.md,
    color: theme.colors.text,
  },
})
