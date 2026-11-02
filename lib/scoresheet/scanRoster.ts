import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../supabase'
import type { RosterScanResult } from '../../types/scoresheet'

export type PhotoSource = 'camera' | 'library'

/** Thrown with a message the scorer can act on. */
export class RosterScanError extends Error {}

/** Opens the camera or the photo library; null when the person cancels. */
export async function pickRosterPhoto(source: PhotoSource): Promise<{ base64: string; mime: string } | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new RosterScanError(source === 'camera' ? 'Allow camera access to photograph a roster.' : 'Allow photo access to choose a roster photo.')
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
  if (result.canceled) return null
  const asset = result.assets[0]
  let base64 = asset.base64 ?? ''
  // Web may hand back a data URL instead of bare base64.
  const m = /^data:([^;]+);base64,(.*)$/.exec(asset.uri)
  if (!base64 && m) base64 = m[2]
  if (!base64) throw new RosterScanError("Couldn't read that photo. Try another one.")
  return { base64, mime: (asset.mimeType ?? m?.[1] ?? 'image/jpeg').toLowerCase() }
}

/** Sends the photo to the read-roster function and returns the players it found. */
export async function readRoster(photo: { base64: string; mime: string }): Promise<RosterScanResult> {
  const { data, error } = await supabase.functions.invoke('read-roster', { body: { image: photo.base64, mime: photo.mime } })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 503) throw new RosterScanError("Roster scanning isn't switched on yet. Type the players in for now.")
    if (status === 429) throw new RosterScanError("That's a lot of scans this hour. Try again later or type the players in.")
    if (status === 400) throw new RosterScanError('That photo is too large or not an image. Try a smaller photo.')
    throw new RosterScanError("Couldn't read the photo. Check your connection and try again.")
  }
  const result = data as RosterScanResult
  return { teamName: result?.teamName ?? null, players: Array.isArray(result?.players) ? result.players : [] }
}
