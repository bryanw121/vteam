import React from 'react'
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from '../Button'
import { Input } from '../Input'
import { theme } from '../../constants'
import type { Profile } from '../../types'
import { profileDisplayName } from '../../utils'
import { MAX_COHOSTS } from '../../hooks/event'
import type { CohostsApi } from '../../types'
import { Spinner } from '../ui/Spinner'

type Props = { cohosts: CohostsApi }

/** Host's "Manage Co-hosts": current co-hosts with remove, and member search to add (max 3). */
export function CohostsDialog({ cohosts: c }: Props) {
  return (
    <Modal visible={c.visible} transparent animationType="fade" onRequestClose={c.close}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={c.close}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.card}>
            <Text style={styles.title}>Manage Co-hosts</Text>
            <Text style={styles.body}>
              Up to 3 co-hosts. They can post announcements, edit the event, manage teams, and remove attendees.
            </Text>

            {c.cohosts.length > 0 && (
              <View style={{ gap: theme.spacing.sm }}>
                {c.cohosts.map(row => {
                  const removing = c.removingId === row.user_id
                  return (
                    <View key={row.user_id} style={styles.cohostRow}>
                      <Text style={styles.name} numberOfLines={1}>{profileDisplayName(row.profiles as Profile)}</Text>
                      <TouchableOpacity onPress={() => c.remove(row.user_id)} hitSlop={8} disabled={removing}>
                        {removing
                          ? <Spinner size="small" color={theme.colors.subtext} />
                          : <Ionicons name="close" size={18} color={theme.colors.subtext} />}
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            )}

            {c.cohosts.length < MAX_COHOSTS && (
              <>
                <Input placeholder="Search by name or username" value={c.query} onChangeText={q => { void c.search(q) }} />
                {c.searching && <Spinner size="small" color={theme.colors.primary} />}
                {c.results.length > 0 && (
                  <View style={{ gap: theme.spacing.xs, maxHeight: 200 }}>
                    <ScrollView nestedScrollEnabled>
                      {c.results.map(p => (
                        <TouchableOpacity key={p.id} onPress={() => c.add(p)} disabled={c.adding} style={styles.resultRow}>
                          <Text style={styles.name} numberOfLines={1}>{profileDisplayName(p)}</Text>
                          <Text style={styles.body}>@{p.username}</Text>
                          {c.adding
                            ? <Spinner size="small" color={theme.colors.primary} />
                            : <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                {c.query.length >= 2 && !c.searching && c.results.length === 0 && (
                  <Text style={[styles.body, { textAlign: 'center' }]}>No users found</Text>
                )}
              </>
            )}

            <Button label="Done" onPress={c.close} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.overlayLight },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    width: 320,
    maxWidth: '92%',
    gap: theme.spacing.md,
  },
  title: { fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text },
  body: { fontSize: theme.font.size.sm, color: theme.colors.subtext },
  name: { flex: 1, fontSize: theme.font.size.md, color: theme.colors.text },
  cohostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
})
