import { Image, Modal, Pressable } from 'react-native'
import { shared } from '../../constants'
import type { ImageViewerProps } from '../../types'

/** A chat picture full screen (#318); a tap or Back closes it. */
export function ImageViewer({ uri, onClose }: ImageViewerProps) {
  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onClose}>
      <Pressable style={shared.chatImageViewer} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close picture">
        {uri ? <Image source={{ uri }} style={shared.chatImageViewerImage} resizeMode="contain" /> : null}
      </Pressable>
    </Modal>
  )
}
