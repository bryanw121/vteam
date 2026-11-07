import React from 'react'
import { View } from 'react-native'
import { lazyChunk } from './LazyChunk'
import { Spinner } from './ui/Spinner'
import { shared } from '../constants'
import type { ChatMessageListProps } from '../types'

/**
 * Web: the virtualized message list (react-virtuoso, ChatMessageListWeb.tsx)
 * is its own chunk, loaded when a conversation opens, so the entry bundle
 * doesn't carry it (#193).
 */
export const ChatMessageList = lazyChunk<ChatMessageListProps>(
  () => import('./ChatMessageListWeb').then(m => ({ default: m.ChatMessageList })),
  <View style={shared.centered}><Spinner label="Loading messages" /></View>,
)
