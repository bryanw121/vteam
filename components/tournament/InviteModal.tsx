import React, { useEffect, useState } from 'react'
import { FlatList, Modal, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { TOURNAMENT_GENERIC_ERROR } from '../../constants/tournamentCopy'
import { buildMemberSearchFilter } from '../../utils'
import { Button } from '../Button'
import { Input } from '../Input'
import type { Profile, TournamentTeamWithRoster } from '../../types'
import { searchProfiles } from '../../hooks/tournament/api'

type Props = {
  visible: boolean
  onClose: () => void
  viewerId: string | null
  /** Used to flag players who are already on a team. */
  teams: TournamentTeamWithRoster[]
  invitingId: string | null
  onInvite: (userId: string) => void
}

/** Full-screen member search for the captain's "Invite Players". */
export function InviteModal({ visible, onClose, viewerId, teams, invitingId, onInvite }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Pick<Profile, 'id' | 'username' | 'first_name' | 'last_name' | 'avatar_url'>[]>([])
  const [error, setError] = useState<string | null>(null)

  const close = () => { setQuery(''); onClose() }

  useEffect(() => {
    const filter = query.trim() ? buildMemberSearchFilter(query) : null
    if (!filter) { setResults([]); setError(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const data = await searchProfiles(filter, viewerId)
        if (!cancelled) { setResults(data ?? []); setError(null) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error && e.message ? e.message : TOURNAMENT_GENERIC_ERROR)
      }
    }, 600)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, viewerId])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 }}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or username…"
            autoCapitalize="none"
            accessibilityLabel="Search players"
            containerStyle={{ flex: 1, marginBottom: 0 }}
            inputStyle={{ height: 44, paddingVertical: 0 }}
          />
          <TouchableOpacity onPress={close} hitSlop={8}>
            <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.md }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        {error && <Text style={{ textAlign: 'center', padding: 16, color: theme.colors.error }}>{error}</Text>}
        <FlatList
          data={results}
          keyExtractor={p => p.id}
          renderItem={({ item }) => {
            const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || item.username
            const alreadyOnTeam = teams.some(t => t.members.some(m => m.user_id === item.id))
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: theme.font.size.md, fontWeight: '600', color: theme.colors.text }}>{name}</Text>
                  <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>@{item.username}</Text>
                  {alreadyOnTeam && <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>Already registered</Text>}
                </View>
                {!alreadyOnTeam && (
                  <Button label="Invite" size="sm" fullWidth={false} loading={invitingId === item.id} onPress={() => onInvite(item.id)} />
                )}
              </View>
            )
          }}
          ListEmptyComponent={query.trim() && !error ? <Text style={{ textAlign: 'center', padding: 24, color: theme.colors.subtext }}>No users found</Text> : null}
        />
      </View>
    </Modal>
  )
}
