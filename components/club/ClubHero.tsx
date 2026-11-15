import { Image, StyleSheet, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { shared, theme, CLUB_AVATAR_SIZE, CLUB_COVER_HEIGHT } from '../../constants'
import type { ClubHeroProps } from '../../types'

const OVERLAP = CLUB_AVATAR_SIZE / 2
const noPointer = { pointerEvents: 'none' } as object

/** Cover photo, floating back / edit / delete, and the avatar overlapping the cover (owners can change both photos). */
export function ClubHero({ club, coverUri, avatarUri, topInset, owner, editing, uploading, onBack, onEdit, onCancelEdit, onDelete, onPickImage }: ClubHeroProps) {
  const initial = club.name.charAt(0).toUpperCase()
  return (
    <View style={{ height: CLUB_COVER_HEIGHT + OVERLAP, marginBottom: theme.spacing.sm }}>
      <View style={{ height: CLUB_COVER_HEIGHT }}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={[StyleSheet.absoluteFill, noPointer]} resizeMode="cover" />
        ) : (
          <LinearGradient colors={theme.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, noPointer]} />
        )}
        {/* Gradient fade at bottom for avatar contrast */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.18)']} style={[StyleSheet.absoluteFill, { top: CLUB_COVER_HEIGHT * 0.5 }, noPointer]} />

        <View style={[shared.clubFloatingBar, { top: Math.max(topInset, theme.spacing.md) + theme.spacing.xs }]}>
          <TouchableOpacity onPress={onBack} style={shared.clubFloatingBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={theme.colors.white} />
          </TouchableOpacity>
          {owner && !editing && (
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <TouchableOpacity onPress={onEdit} style={shared.clubFloatingBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit club" testID="club-edit">
                <Ionicons name="pencil-outline" size={18} color={theme.colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} style={[shared.clubFloatingBtn, shared.clubFloatingBtnDanger]} hitSlop={12} accessibilityRole="button" accessibilityLabel="Delete club" testID="club-delete">
                <Ionicons name="trash-outline" size={18} color={theme.colors.white} />
              </TouchableOpacity>
            </View>
          )}
          {editing && (
            <TouchableOpacity onPress={onCancelEdit} style={shared.clubFloatingBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Stop editing">
              <Ionicons name="close" size={20} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {owner && (
          <TouchableOpacity onPress={() => onPickImage('cover')} style={shared.clubCoverEditBtn} disabled={uploading.cover} accessibilityRole="button">
            {uploading.cover
              ? <Spinner size="small" color={theme.colors.white} />
              : <Ionicons name="camera-outline" size={14} color={theme.colors.white} />}
            <Text style={shared.clubCoverEditLabel}>{coverUri ? 'Edit cover' : 'Add cover'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Club avatar: overlaps the cover's bottom edge */}
      <View style={{ alignItems: 'center', marginTop: -OVERLAP }} pointerEvents="box-none">
        <TouchableOpacity
          onPress={owner ? () => onPickImage('avatar') : undefined}
          activeOpacity={owner ? 0.8 : 1}
          style={{ position: 'relative' }}
          accessibilityRole={owner ? 'button' : undefined}
          accessibilityLabel={owner ? 'Change club photo' : undefined}
        >
          <View style={shared.clubAvatarRing}>
            <View style={shared.clubAvatar}>
              {uploading.avatar ? (
                <Spinner color={theme.colors.primary} />
              ) : avatarUri ? (
                <Image source={{ uri: avatarUri }} style={shared.clubAvatarImage} resizeMode="cover" />
              ) : (
                <Text style={shared.clubAvatarInitial}>{initial}</Text>
              )}
            </View>
          </View>
          {owner && (
            <View style={shared.clubAvatarCameraBtn}>
              <Ionicons name="camera-outline" size={12} color={theme.colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}
