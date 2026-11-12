import React, { useEffect, useState } from 'react'
import { ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import type { Tournament, TournamentTeamWithRoster } from '../../types'

/** The tournament screen's bottom sheets, on the shared ui/BottomSheet. */

const sheetInput = { backgroundColor: theme.colors.background } as const

// ─── Register ─────────────────────────────────────────────────────────────────

type RegisterProps = {
  visible: boolean
  onDismiss: () => void
  tournament: Pick<Tournament, 'min_roster_size' | 'max_roster_size' | 'max_teams'>
  /** Every team spot is taken: a new team joins the waitlist (the server decides). */
  full: boolean
  busy: boolean
  /** Resolves true when registered (the sheet then resets). */
  onSubmit: (v: { name: string; freeAgent: boolean }) => Promise<boolean>
}

export function RegisterSheet({ visible, onDismiss, tournament, full, busy, onSubmit }: RegisterProps) {
  const [freeAgent, setFreeAgent] = useState(false)
  const [name, setName] = useState('')
  useEffect(() => { if (!visible) { setFreeAgent(false); setName('') } }, [visible])

  const toggle = (active: boolean, label: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: active ? theme.colors.primary : theme.colors.border, alignItems: 'center' }}
    >
      <Text style={{ fontSize: theme.font.size.md, color: active ? theme.colors.primary : theme.colors.subtext, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Register">
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        {toggle(!freeAgent, 'Register Team', () => setFreeAgent(false))}
        {toggle(freeAgent, 'Free Agent', () => setFreeAgent(true))}
      </View>

      {!freeAgent ? (
        <>
          <Input label="Team name" value={name} onChangeText={setName} placeholder="e.g. Block Party" inputStyle={sheetInput} containerStyle={{ marginBottom: 8 }} />
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, marginBottom: 20 }}>
            Roster size: {tournament.min_roster_size}–{tournament.max_roster_size} players. You'll be the captain.
          </Text>
          {full && (
            <Text testID="register-waitlist-note" style={{ fontSize: theme.font.size.sm, color: theme.colors.warning, marginTop: -12, marginBottom: 20 }}>
              All {tournament.max_teams} team spots are taken. Your team joins the waitlist and moves up if a team withdraws.
            </Text>
          )}
        </>
      ) : (
        <Text style={{ fontSize: theme.font.size.smd, color: theme.colors.subtext, marginBottom: 20 }}>
          You'll be placed in the free agent pool. You can request to join a team later, or the organizer may assign you.
        </Text>
      )}

      <Button
        label="Register"
        testID="register-submit"
        loading={busy}
        disabled={!freeAgent && !name.trim()}
        onPress={() => { void onSubmit({ name: name.trim(), freeAgent }) }}
      />
    </BottomSheet>
  )
}

// ─── Request to join ──────────────────────────────────────────────────────────

export function JoinRequestSheet({ team, onDismiss, busy, onSend }: {
  team: TournamentTeamWithRoster | null
  onDismiss: () => void
  busy: boolean
  onSend: (team: TournamentTeamWithRoster) => void
}) {
  return (
    <BottomSheet visible={!!team} onDismiss={onDismiss} title="Request to Join">
      <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext, marginBottom: 20 }}>
        Send a join request to <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{team?.name}</Text>. The captain will be notified.
      </Text>
      <Button label="Send Request" loading={busy} onPress={() => team && onSend(team)} />
    </BottomSheet>
  )
}

// ─── Pick a team (assign free agent / move player) ────────────────────────────

export function PickTeamSheet({ visible, title, subtitle, teams, onPick, onDismiss }: {
  visible: boolean
  title: string
  subtitle: React.ReactNode
  teams: TournamentTeamWithRoster[]
  onPick: (team: TournamentTeamWithRoster) => void
  onDismiss: () => void
}) {
  const { height } = useWindowDimensions()
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title}>
      <Text style={{ fontSize: theme.font.size.smd, color: theme.colors.subtext, marginBottom: 16 }}>{subtitle}</Text>
      <ScrollView style={{ maxHeight: height * 0.45 }}>
        {teams.map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => onPick(t)}
            style={{ paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
          >
            <Text style={{ fontSize: theme.font.size.lgs, color: theme.colors.text }}>{t.name}</Text>
            <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{t.members.length} player{t.members.length !== 1 ? 's' : ''}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  )
}

// ─── Add prize ────────────────────────────────────────────────────────────────

export function PrizeSheet({ visible, onDismiss, busy, onSubmit }: {
  visible: boolean
  onDismiss: () => void
  busy: boolean
  /** Resolves true when saved (the sheet then clears). */
  onSubmit: (v: { placeLabel: string; description: string; amount: string }) => Promise<boolean>
}) {
  const [form, setForm] = useState({ placeLabel: '', description: '', amount: '' })
  const valid = !!form.placeLabel.trim() && !!form.description.trim()

  async function submit() {
    if (!valid) return
    const saved = await onSubmit({
      placeLabel: form.placeLabel.trim(), description: form.description.trim(), amount: form.amount.trim(),
    })
    if (saved) setForm({ placeLabel: '', description: '', amount: '' })
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Add Prize">
      <Input label="Place label" value={form.placeLabel} onChangeText={v => setForm(f => ({ ...f, placeLabel: v }))} placeholder="e.g. 1st Place" inputStyle={sheetInput} />
      <Input label="Description" value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="e.g. Trophy + Medal" inputStyle={sheetInput} />
      <Input label="Amount (optional)" value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))} placeholder="e.g. $200" inputStyle={sheetInput} />
      <Button label="Add Prize" loading={busy} disabled={!valid} onPress={() => { void submit() }} />
    </BottomSheet>
  )
}

// ─── Announcement ─────────────────────────────────────────────────────────────

export function AnnouncementSheet({ visible, onDismiss, busy, onSubmit }: {
  visible: boolean
  onDismiss: () => void
  busy: boolean
  /** Resolves true when posted (the sheet then clears). */
  onSubmit: (body: string) => Promise<boolean>
}) {
  const [text, setText] = useState('')

  async function submit() {
    if (!text.trim()) return
    if (await onSubmit(text.trim())) setText('')
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Post Announcement">
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Write an announcement for all participants…"
        multiline
        numberOfLines={4}
        inputStyle={{ ...sheetInput, minHeight: 100, textAlignVertical: 'top' }}
      />
      <Button label="Post" loading={busy} disabled={!text.trim()} onPress={() => { void submit() }} />
    </BottomSheet>
  )
}
