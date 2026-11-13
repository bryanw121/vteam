import React from 'react'
import { FlatList, View } from 'react-native'
import { RefreshControl } from './RefreshControl'
import { shared, theme } from '../constants'
import type { ChatMessageListProps, MessageWithDetails } from '../types'
import { Spinner } from './ui/Spinner'

const keyOf = (m: MessageWithDetails) => m.id

/**
 * Native message list: an inverted FlatList over newest-first data, so it is
 * virtualized and bottom-anchored for free. Web uses react-virtuoso
 * (`ChatMessageList.web.tsx`).
 */
export function ChatMessageList({ messages, renderMessage, hasMore, onLoadMore, refreshing, onRefresh }: ChatMessageListProps) {
  return (
    <FlatList
      data={messages}
      keyExtractor={keyOf}
      renderItem={({ item }) => renderMessage(item)}
      inverted
      contentContainerStyle={{ paddingVertical: theme.spacing.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      onEndReached={hasMore ? onLoadMore : undefined}
      onEndReachedThreshold={0.2}
      ListFooterComponent={(hasMore ? (
        <View style={shared.chatListEdge}>
          <Spinner size="small" color={theme.colors.subtext} />
        </View>
      ) : null) ?? undefined}
    />
  )
}
