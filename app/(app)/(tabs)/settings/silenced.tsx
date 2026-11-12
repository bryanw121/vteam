import React, { useCallback } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useSilencedUsers } from '../../../../hooks/useSilencedUsers'
import { shared, theme } from '../../../../constants'
import { profileAvatarSmallUri, profileDisplayName } from '../../../../utils'
import { Spinner } from '../../../../components/ui/Spinner'

/** "Unknown" for a missing profile; otherwise the shared member display name. */
function displayName(p: { first_name: string | null; last_name: string | null; username: string } | null) {
  if (!p) return 'Unknown'
  return profileDisplayName(p)
}

export default function SilencedPeopleScreen() {
  useStackBackTitle('Silenced people')
  const { entries, loading, refresh, unsilenceUser } = useSilencedUsers()
  const [refreshing, setRefreshing] = React.useState(false)

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  async function onRefresh() {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: 32 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.primary} />
        }
      >
        <Text style={[shared.caption, { marginBottom: theme.spacing.md }]}>
          Messages from these people are hidden in chat. They can still message you; this only affects what you see.
        </Text>

        {loading && entries.length === 0 ? (
          <View style={{ paddingVertical: theme.spacing.xl, alignItems: 'center' }}>
            <Spinner color={theme.colors.primary} />
          </View>
        ) : entries.length === 0 ? (
          <View style={[shared.card, { alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.sm }]}>
            <Ionicons name="eye-outline" size={40} color={theme.colors.subtext} />
            <Text style={[shared.body, { textAlign: 'center', color: theme.colors.subtext }]}>
              No silenced users. Long-press a message (or use the ⋮ menu) → Silence user.
            </Text>
          </View>
        ) : (
          <View style={[shared.card, { padding: 0, overflow: 'hidden' }]}>
            {entries.map((row, idx) => {
              const p = row.profiles
              const uri = profileAvatarSmallUri(p?.avatar_url ?? null)
              const last = idx === entries.length - 1
              return (
                <View
                  key={row.silenced_user_id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.md,
                    gap: theme.spacing.md,
                    borderBottomWidth: last ? 0 : 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: theme.colors.border,
                    overflow: 'hidden',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {uri ? (
                      <Image source={{ uri }} style={{ width: 44, height: 44 }} />
                    ) : (
                      <Ionicons name="person" size={22} color={theme.colors.subtext} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={1}>
                      {displayName(p)}
                    </Text>
                    {p?.username ? (
                      <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }} numberOfLines={1}>
                        @{p.username}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => { void unsilenceUser(row.silenced_user_id) }}
                    style={({ pressed }) => ({
                      paddingVertical: theme.spacing.sm,
                      paddingHorizontal: theme.spacing.md,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.primary + '18',
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.primaryText }}>
                      Unsilence
                    </Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
