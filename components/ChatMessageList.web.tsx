import React from 'react'
import { View } from 'react-native'
import { lazyChunk, preloadWhenIdle } from './LazyChunk'
import { Spinner } from './ui/Spinner'
import { shared } from '../constants'
import type { ChatMessageListProps } from '../types'

/**
 * Web: the virtualized message list (react-virtuoso, ChatMessageListWeb.tsx)
 * is its own chunk, loaded when a conversation opens, so the entry bundle
 * doesn't carry it (#193).
 */
const loadList = () => import('./ChatMessageListWeb').then(m => ({ default: m.ChatMessageList }))

// Fetched when the browser is idle after load, so opening a conversation
// doesn't wait for it (only the very first open right after load can).
preloadWhenIdle(loadList)

export const ChatMessageList = lazyChunk<ChatMessageListProps>(
  loadList,
  <View style={shared.centered}><Spinner label="Loading messages" /></View>,
)
