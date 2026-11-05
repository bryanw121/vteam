import { Image, Modal, Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { ProfileAvatar } from '../ProfileAvatar'
import type { Profile } from '../../types'
import type { AvatarUploader as AvatarUploaderState } from '../../types'

export const AVATAR_SIZE = 88
const PREVIEW_SIZE = AVATAR_SIZE + 6 + 8

type Props = {
  profile: Profile
  uploader: AvatarUploaderState
  /** Edit mode makes the picture tappable and adds the remove button and hint text. */
  editMode: boolean
}

/**
 * The profile picture with its owner controls. In edit mode: tap to pick a
 * photo, x to remove it, and a preview/confirm dialog before anything uploads.
 */
export function AvatarUploader({ profile, uploader, editMode }: Props) {
  return (
    <>
      <ProfileAvatar
        uri={uploader.uri}
        loading={uploader.busy}
        border={profile.selected_border}
        size={AVATAR_SIZE}
        onPress={editMode ? () => void uploader.pick() : undefined}
        onDelete={editMode && profile.avatar_url ? () => void uploader.remove() : undefined}
      />

      {editMode && (
        <>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
            Tap to {profile.avatar_url ? 'change' : 'add'} a photo.
          </Text>
          {uploader.uriError && profile.avatar_url ? (
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.hot, textAlign: 'center' }}>
              Could not load image. Fix Storage SELECT policy for the avatars bucket.
            </Text>
          ) : null}
        </>
      )}

      {uploader.pending && (
        <Modal transparent animationType="fade" onRequestClose={uploader.cancel}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.xl,
              padding: theme.spacing.xl,
              alignItems: 'center',
              gap: theme.spacing.lg,
              width: '100%',
              maxWidth: 320,
            }}>
              <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>Preview</Text>
              <View style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: PREVIEW_SIZE / 2, overflow: 'hidden', backgroundColor: theme.colors.border }}>
                <Image source={{ uri: uploader.pending.uri }} style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }} resizeMode="cover" />
              </View>
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                This is how your profile picture will appear.
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, width: '100%' }}>
                <Pressable
                  onPress={uploader.cancel}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: theme.spacing.sm + 2,
                    borderRadius: theme.radius.md,
                    borderWidth: 1, borderColor: theme.colors.border,
                    alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, fontWeight: theme.font.weight.medium }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void uploader.confirm()}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: theme.spacing.sm + 2,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ fontSize: theme.font.size.md, color: theme.colors.onPrimary, fontWeight: theme.font.weight.semibold }}>Use Photo</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  )
}
