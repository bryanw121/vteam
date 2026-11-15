import { useCallback, useMemo, useRef, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import type { RefObject } from 'react'
import type { TextInputInstance } from 'react-native'
import { chatAlert } from '../../utils/chatUtils'
import { applyMention, canSend as canSendNow, detectMention, mentionIdsIn, mentionSuggestions } from '../../utils/chatComposer'
import type { ActiveMention, MentionUser, MessageWithDetails } from '../../types'

type Deps = {
  inputRef: RefObject<TextInputInstance | null>
  mentionableUsers: MentionUser[]
  sendMessage: (content: string | null, imageUrl: string | null, replyTo: MessageWithDetails | null, mentions: string[]) => Promise<boolean>
  editMessage: (messageId: string, content: string) => Promise<boolean>
  uploadImage: (uri: string) => Promise<string | null>
}

/**
 * The chat room's composer (#318): the draft, a picked picture, the message being
 * replied to or edited, @mentions, and Send. The rules for a failed send:
 * - a failed send leaves the composer empty: the bubble's "Not sent · Tap to retry"
 *   is the one way to retry (restoring the draft too invited a second copy);
 * - a picture that didn't upload sends nothing and puts text, picture and reply back;
 * - a failed edit rolls the bubble back and puts the edit back in the composer.
 */
export function useChatComposer({ inputRef, mentionableUsers, sendMessage, editMessage, uploadImage }: Deps) {
  const [text, setText] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageWithDetails | null>(null)
  const [editingMessage, setEditingMessage] = useState<MessageWithDetails | null>(null)
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null)
  const cursorRef = useRef(0)

  const hasUsers = mentionableUsers.length > 0
  const onChangeText = useCallback((t: string) => {
    setText(t)
    setActiveMention(detectMention(t, cursorRef.current, hasUsers))
  }, [hasUsers])

  const onSelectionChange = useCallback((cursor: number) => {
    cursorRef.current = cursor
    setActiveMention(detectMention(text, cursor, hasUsers))
  }, [text, hasUsers])

  const selectMention = useCallback((user: MentionUser) => {
    if (!activeMention) return
    const next = applyMention(text, activeMention, cursorRef.current, user.username)
    setText(next.text)
    cursorRef.current = next.cursor
    setActiveMention(null)
  }, [activeMention, text])

  const suggestions = useMemo(() => mentionSuggestions(mentionableUsers, activeMention), [mentionableUsers, activeMention])

  const clearInput = useCallback(() => {
    setText('')
    inputRef.current?.clear()
  }, [inputRef])

  const startEdit = useCallback((message: MessageWithDetails) => {
    setEditingMessage(message)
    setText(message.content ?? '')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [inputRef])

  const cancelEdit = useCallback(() => {
    setEditingMessage(null)
    clearInput()
  }, [clearInput])

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (editingMessage) {
      if (!trimmed) return
      const editing = editingMessage
      clearInput()
      setEditingMessage(null)
      const ok = await editMessage(editing.id, trimmed)
      if (!ok) {
        // The bubble was rolled back; put the edit back in the composer.
        setEditingMessage(editing)
        setText(cur => cur || trimmed)
      }
      return
    }
    if (!trimmed && !imageUri) return
    const mentionIds = mentionIdsIn(trimmed, mentionableUsers)
    const pickedImage = imageUri
    const replyingTo = replyTo
    clearInput()
    setImageUri(null)
    setReplyTo(null)
    setActiveMention(null)
    setSending(true)
    try {
      let uploadedUrl: string | null = null
      if (pickedImage) {
        setUploadingImage(true)
        uploadedUrl = await uploadImage(pickedImage)
        setUploadingImage(false)
        if (!uploadedUrl) {
          // Never send the text alone when the picture didn't make it: restore the draft.
          setText(cur => cur || trimmed)
          setImageUri(cur => cur ?? pickedImage)
          setReplyTo(cur => cur ?? replyingTo)
          chatAlert("Couldn't upload image", 'Your message was not sent. Check your connection and try again.')
          return
        }
      }
      // A failed send stays in the list as "Not sent · Tap to retry"; the draft is not restored.
      await sendMessage(trimmed || null, uploadedUrl, replyingTo, mentionIds)
    } finally {
      setUploadingImage(false)
      setSending(false)
    }
  }, [text, editingMessage, imageUri, replyTo, mentionableUsers, clearInput, editMessage, uploadImage, sendMessage])

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false })
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri)
  }, [])

  return {
    text, imageUri, sending, uploadingImage, replyTo, editingMessage, suggestions,
    canSend: canSendNow({ text, imageUri, editing: !!editingMessage, sending }),
    onChangeText, onSelectionChange, selectMention, send, pickImage,
    setReplyTo, setImageUri, startEdit, cancelEdit,
  }
}
