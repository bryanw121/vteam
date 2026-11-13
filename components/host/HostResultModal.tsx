import React from 'react'
import { Modal, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared } from '../../constants'
import type { HostResultModalProps } from '../../types'

/** What happened to a save: saved, or nothing saved, or (until #188 part 4) saved without its tags. */
export function HostResultModal({ visible, outcome, message, isEdit, onClose, onDone }: HostResultModalProps) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={shared.modalOverlay} onPress={onClose}>
        <View style={shared.modalCard}>
          <Text style={shared.modalEmoji}>{outcome === 'saved' ? '🏐' : '⚠️'}</Text>
          <Text style={shared.modalTitle}>{message}</Text>
          <Text style={shared.modalBody}>
            {outcome === 'tags-failed'
              ? 'Your event details were saved, but its tags were left unchanged.'
              : outcome === 'tags-uncertain'
                ? 'Your event details were saved, but its tags may not match your changes. Reopen the event and review them.'
              : outcome === 'failed'
                ? 'Nothing was saved. Check your connection and try again.'
                : isEdit ? 'Your changes have been saved.' : 'Your event is now live for members to join.'}
          </Text>
          <TouchableOpacity style={shared.modalButton} onPress={outcome === 'saved' ? onDone : onClose}>
            <Text style={shared.modalButtonText}>{outcome === 'saved' ? 'Done' : 'Close'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}
