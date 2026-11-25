import { forwardRef } from 'react'
import { Image, Platform, ScrollView, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, TextInput } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { shared, theme } from '../../constants'
import type { ChatComposerBandProps, ChatComposerProps } from '../../types'
import type { TextInputInstance } from 'react-native'

/** The strip above the input for a reply or an edit: icon, what it is, the quoted text, and ✕. */
function ComposerBand({ icon, title, body, cancelLabel, onCancel }: ChatComposerBandProps) {
  return (
    <View style={shared.chatComposerBand}>
      <Ionicons name={icon} size={16} color={theme.colors.primaryText} />
      <View style={shared.chatComposerQuote}>
        <Text style={shared.chatComposerQuoteTitle}>{title}</Text>
        <Text style={shared.chatComposerQuoteBody} numberOfLines={1}>{body}</Text>
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel={cancelLabel}>
        <Ionicons name="close" size={18} color={theme.colors.subtext} />
      </TouchableOpacity>
    </View>
  )
}

/**
 * Bottom of the chat room (#318): reply / edit strip, picked picture, @mention
 * suggestions (club chats) and the pill input with Send. State lives in
 * `useChatComposer`; this only draws it.
 */
export const ChatComposer = forwardRef<TextInputInstance, ChatComposerProps>(function ChatComposer(
  { composer, isClub, replyLabel, replyBody },
  inputRef,
) {
  const insets = useSafeAreaInsets()
  const c = composer
  const busy = c.sending || c.uploadingImage
  return (
    <>
      {c.replyTo ? (
        <ComposerBand icon="return-down-back" title={replyLabel} body={replyBody} cancelLabel="Cancel reply" onCancel={() => c.setReplyTo(null)} />
      ) : null}
      {c.editingMessage ? (
        <ComposerBand icon="pencil-outline" title="Editing message" body={c.editingMessage.content ?? ''} cancelLabel="Cancel edit" onCancel={c.cancelEdit} />
      ) : null}

      {c.imageUri ? (
        <View style={shared.chatComposerBand}>
          <Image source={{ uri: c.imageUri }} style={shared.chatComposerPreview} resizeMode="cover" accessibilityLabel="Picture to send" />
          <TouchableOpacity onPress={() => c.setImageUri(null)} style={shared.chatComposerPreviewRemove} accessibilityRole="button" accessibilityLabel="Remove picture">
            <View style={shared.chatComposerPreviewRemoveDot}>
              <Ionicons name="close" size={12} color={theme.colors.white} />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {c.suggestions.length > 0 ? (
        <View style={shared.chatMentionList}>
          <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
            {c.suggestions.map((u, idx) => (
              <TouchableOpacity
                key={u.id}
                onPress={() => c.selectMention(u)}
                style={[shared.chatMentionRow, { borderBottomWidth: idx < c.suggestions.length - 1 ? 1 : 0 }]}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${u.displayName}`}
              >
                <View style={shared.chatMentionAvatar}>
                  <Ionicons name="person" size={16} color={theme.colors.subtext} />
                </View>
                <View>
                  <Text style={shared.chatMentionName}>{u.displayName}</Text>
                  <Text style={shared.chatMentionHandle}>@{u.username}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={[shared.chatInputBar, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <TouchableOpacity onPress={() => void c.pickImage()} style={shared.chatAttach} accessibilityRole="button" accessibilityLabel="Attach image">
          <Ionicons name="image-outline" size={22} color={theme.colors.subtext} />
        </TouchableOpacity>
        <View style={shared.chatInputPill}>
          <TextInput
            ref={inputRef}
            value={c.text}
            onChangeText={c.onChangeText}
            onSelectionChange={isClub ? e => c.onSelectionChange(e.nativeEvent.selection.start) : undefined}
            placeholder="Message…"
            placeholderTextColor={theme.colors.subtext}
            accessibilityLabel="Message"
            multiline
            style={shared.chatInput}
            // Web: Enter sends, Shift+Enter inserts a newline. onSubmitEditing
            // doesn't fire reliably for multiline <textarea> on RNW, so handle
            // the key directly.
            onKeyPress={Platform.OS === 'web' ? (e: { key?: string; shiftKey?: boolean; preventDefault?: () => void; nativeEvent?: { key?: string; shiftKey?: boolean } }) => {
              const key = e.key ?? e.nativeEvent?.key
              const shift = e.shiftKey ?? e.nativeEvent?.shiftKey
              if (key === 'Enter' && !shift) {
                e.preventDefault?.()
                void c.send()
              }
            } : undefined}
          />
          <TouchableOpacity
            onPress={() => void c.send()}
            disabled={!c.canSend}
            style={[shared.chatSend, c.canSend && shared.chatSendOn]}
            accessibilityRole="button"
            accessibilityLabel={c.editingMessage ? 'Save edit' : 'Send'}
            accessibilityState={{ disabled: !c.canSend, busy }}
          >
            {busy ? (
              <Spinner size="small" color={c.canSend ? theme.colors.white : theme.colors.subtext} label="Sending" />
            ) : (
              <Ionicons name="send" size={16} color={c.canSend ? theme.colors.white : theme.colors.subtext} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </>
  )
})
