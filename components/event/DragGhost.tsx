import React from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import Animated from 'react-native-reanimated'
import { shared, theme, TEAM_COLORS } from '../../constants'
import type { Profile, TeamAssignment } from '../../types'
import { profileDisplayName, profileInitial } from '../../utils'
import type { TeamDragApi } from '../../types'

type Props = {
  drag: TeamDragApi
  attendees: Profile[]
  assignments: Record<string, TeamAssignment>
}

/** The card that follows the pointer while a host drags a player between teams. */
export function DragGhost({ drag, attendees, assignments }: Props) {
  const id = drag.draggingPlayerId
  if (!id) return null
  const profile = attendees.find(p => p.id === id)
  if (!profile) return null
  const teamNum = assignments[id]?.team ?? null
  const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
  return (
    <Animated.View
      style={[styles.ghostCard, drag.ghostStyle, Platform.OS === 'web' ? { position: 'fixed' as 'absolute' } : null]}
      pointerEvents="none"
    >
      <View style={[shared.playerCardAvatar, {
        borderColor: teamColor ?? theme.colors.border,
        backgroundColor: teamColor ? teamColor + '18' : theme.colors.card,
        borderWidth: teamColor ? 2 : 1.5,
      }]}>
        <Text style={[shared.playerCardAvatarInitial, { color: teamColor ?? theme.colors.subtext }]}>{profileInitial(profile)}</Text>
      </View>
      <Text style={[shared.playerCardName, { flex: 1 }]} numberOfLines={1}>{profileDisplayName(profile)}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  ghostCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    width: 160,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
  },
})
