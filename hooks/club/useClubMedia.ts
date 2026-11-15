import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { CLUB_AVATARS_BUCKET } from '../../constants'
import { resolveClubAvatarUri } from '../../utils'
import { clubMediaColumn, clubMediaPath, isClubStoragePath } from '../../utils/clubForm'
import type { ClubMediaKind, ClubWithDetails } from '../../types'

/** Upload a club photo, remove the one it replaces, and point the club at it. Toasts on failure; true when saved. */
export async function uploadClubPhoto(club: Pick<ClubWithDetails, 'id' | 'avatar_url' | 'cover_url'>, kind: ClubMediaKind, file: Blob, mimeType: string): Promise<boolean> {
  const path = clubMediaPath(club.id, kind, mimeType, Date.now())
  const oldPath = kind === 'avatar' ? club.avatar_url : club.cover_url
  if (isClubStoragePath(oldPath)) await supabase.storage.from(CLUB_AVATARS_BUCKET).remove([oldPath])
  const { error: uploadError } = await supabase.storage.from(CLUB_AVATARS_BUCKET).upload(path, file, { contentType: mimeType })
  if (uploadError) { toast.error("Couldn't upload the photo", uploadError); return false }
  const { error: updateError } = await supabase.from('clubs').update({ [clubMediaColumn(kind)]: path }).eq('id', club.id)
  if (updateError) { toast.error("Couldn't save the photo", updateError); return false }
  return true
}

/**
 * A club's avatar and cover (#305): resolved display URIs, and the owner's pick-and-upload
 * for each, with a busy flag per photo. `onSaved` refetches the page after a new photo.
 */
export function useClubMedia(club: ClubWithDetails | null, onSaved: () => void) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [coverUri, setCoverUri] = useState<string | null>(null)
  const [uploading, setUploading] = useState({ avatar: false, cover: false })
  const avatarPath = club?.avatar_url ?? null
  const coverPath = club?.cover_url ?? null

  useEffect(() => {
    let cancelled = false
    void Promise.all([resolveClubAvatarUri(avatarPath), resolveClubAvatarUri(coverPath)]).then(([avatar, cover]) => {
      if (cancelled) return
      setAvatarUri(avatar)
      setCoverUri(cover)
    })
    return () => { cancelled = true }
  }, [avatarPath, coverPath])

  async function upload(kind: ClubMediaKind, file: Blob, mimeType: string) {
    if (!club) return
    setUploading(u => ({ ...u, [kind]: true }))
    try {
      if (await uploadClubPhoto(club, kind, file, mimeType)) onSaved()
    } finally {
      setUploading(u => ({ ...u, [kind]: false }))
    }
  }

  function pick(kind: ClubMediaKind) {
    if (!club) return
    if (Platform.OS === 'web') {
      // On mobile web (iOS Safari), programmatic file input clicks must happen
      // synchronously within the user gesture: any await before .click() kills it.
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (file) void upload(kind, file, file.type || 'image/jpeg')
      }
      input.click()
      return
    }
    void (async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        toast.show({ title: 'Photo access needed', message: 'Allow access to your photo library.', variant: 'warning' })
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: kind === 'avatar' ? [1, 1] : [3, 1],
        quality: 0.8,
      })
      const asset = result.canceled ? null : result.assets[0]
      if (!asset) return
      const blob = await (await fetch(asset.uri)).blob()
      await upload(kind, blob, asset.mimeType ?? 'image/jpeg')
    })()
  }

  return { avatarUri, coverUri, uploading, pick }
}
