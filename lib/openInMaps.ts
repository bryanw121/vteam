import { Platform } from 'react-native'
import * as Linking from 'expo-linking'

/** Open the platform's maps app (web: Google Maps in a new tab) searching for `query`. */
export function openInMaps(query: string): void {
  const encoded = encodeURIComponent(query)
  if (Platform.OS === 'ios') {
    void Linking.openURL(`maps:?q=${encoded}`)
  } else if (Platform.OS === 'android') {
    void Linking.openURL(`geo:0,0?q=${encoded}`)
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank', 'noopener,noreferrer')
  }
}
