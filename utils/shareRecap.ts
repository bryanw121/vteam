import { Share } from 'react-native'
import type { RecapShareTarget } from '../types'

/**
 * Native: the system share sheet with the text and link; on iOS the picture's
 * URL rides along (Instagram and Messages render it). Android shares the text.
 */
export async function shareRecap(args: { imageUrl: string; text: string; link: string }): Promise<RecapShareTarget | null> {
  const res = await Share.share({ message: `${args.text}\n${args.link}`, url: args.imageUrl })
  return res.action === Share.dismissedAction ? null : 'native'
}
