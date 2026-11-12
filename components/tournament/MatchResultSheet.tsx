import React, { useEffect, useMemo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { parseSets, winnerFromSets } from '../../lib/tournamentResults'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { Input } from '../Input'
import type { SetScore, SetScoreDraft, TournamentMatchRow } from '../../types'

type Props = {
  match: TournamentMatchRow | null
  teamName: (id: string | null) => string
  /** Sets needed to win (best of 2n - 1); sizes the score rows. */
  setsToWin: number
  busy: boolean
  onDismiss: () => void
  /** Resolves true when saved (the sheet then closes). */
  onSubmit: (v: { winnerId: string; sets: SetScore[]; forfeit: boolean }) => Promise<boolean>
}

const scoreInput = { backgroundColor: theme.colors.background, textAlign: 'center' as const }

function draftsFor(match: TournamentMatchRow | null, rows: number): SetScoreDraft[] {
  return Array.from({ length: rows }, (_, i) => {
    const s = match?.sets.find(x => x.set_number === i + 1)
    return s ? { a: String(s.team_a_score), b: String(s.team_b_score) } : { a: '', b: '' }
  })
}

/**
 * Organizer result entry: set scores (the winner follows from them), or just
 * the winner when scores weren't kept, or a forfeit.
 */
export function MatchResultSheet({ match, teamName, setsToWin, busy, onDismiss, onSubmit }: Props) {
  const rows = Math.max(1, setsToWin * 2 - 1)
  const [drafts, setDrafts] = useState<SetScoreDraft[]>(() => draftsFor(match, rows))
  const [picked, setPicked] = useState<string | null>(match?.winner_id ?? null)
  const [forfeit, setForfeit] = useState(match?.status === 'forfeit')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDrafts(draftsFor(match, rows))
    setPicked(match?.winner_id ?? null)
    setForfeit(match?.status === 'forfeit')
    setError(null)
  }, [match, rows])

  const parsed = useMemo(() => parseSets(drafts), [drafts])
  const fromSets = forfeit ? null : winnerFromSets(parsed.sets)
  const a = match?.team_a_id ?? null
  const b = match?.team_b_id ?? null
  const winnerId = fromSets === 'a' ? a : fromSets === 'b' ? b : picked

  function setScore(i: number, side: 'a' | 'b', v: string) {
    setDrafts(d => d.map((row, j) => (j === i ? { ...row, [side]: v.replace(/[^0-9]/g, '') } : row)))
    setError(null)
  }

  async function save() {
    if (!match) return
    if (!forfeit && parsed.error) { setError(parsed.error); return }
    if (!winnerId) { setError('Enter the set scores, or pick the winner.'); return }
    if (!forfeit && parsed.sets.length > 0 && !fromSets) { setError('The sets are level. Add the deciding set.'); return }
    await onSubmit({ winnerId, sets: forfeit ? [] : parsed.sets, forfeit })
  }

  const winnerButton = (id: string | null) => {
    const active = !!id && winnerId === id
    const locked = !!fromSets
    return (
      <TouchableOpacity
        key={id ?? 'none'}
        disabled={!id || locked}
        onPress={() => { setPicked(id); setError(null) }}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: !id || locked }}
        accessibilityLabel={`${teamName(id)} won`}
        testID={id === a ? 'result-winner-a' : 'result-winner-b'}
        style={{
          flex: 1, minHeight: 48, paddingHorizontal: 10, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: active ? theme.colors.primary : theme.colors.border,
          backgroundColor: active ? theme.colors.primarySoft : 'transparent',
        }}
      >
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: active ? theme.colors.text : theme.colors.subtext }}>
          {teamName(id)}
        </Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{active ? 'Winner' : 'Tap if they won'}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <BottomSheet visible={!!match} onDismiss={onDismiss} title="Record result">
      {match && (
        <View style={{ gap: theme.spacing.md }}>
          {!forfeit && (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text style={{ width: 48 }} />
                <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text }}>{teamName(a)}</Text>
                <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text }}>{teamName(b)}</Text>
              </View>
              {drafts.map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Text style={{ width: 48, fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>Set {i + 1}</Text>
                  <Input
                    value={d.a}
                    onChangeText={v => setScore(i, 'a', v)}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="–"
                    accessibilityLabel={`Set ${i + 1} ${teamName(a)} score`}
                    testID={`set-${i + 1}-a`}
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                    inputStyle={scoreInput}
                  />
                  <Input
                    value={d.b}
                    onChangeText={v => setScore(i, 'b', v)}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="–"
                    accessibilityLabel={`Set ${i + 1} ${teamName(b)} score`}
                    testID={`set-${i + 1}-b`}
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                    inputStyle={scoreInput}
                  />
                </View>
              ))}
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                Leave the scores empty if you only know who won.
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {winnerButton(a)}
            {winnerButton(b)}
          </View>

          <TouchableOpacity
            onPress={() => { setForfeit(f => !f); setError(null) }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: forfeit }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
              borderColor: forfeit ? theme.colors.primary : theme.colors.border, backgroundColor: forfeit ? theme.colors.primary : 'transparent',
            }}>
              {forfeit && <Text style={{ color: theme.colors.onPrimary, fontSize: theme.font.size.sm, fontFamily: theme.fonts.bodyBold }}>✓</Text>}
            </View>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.text }}>Won by forfeit</Text>
          </TouchableOpacity>

          {!!error && <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.error }}>{error}</Text>}

          <Button label="Save result" onPress={() => { void save() }} loading={busy} testID="result-save" />
        </View>
      )}
    </BottomSheet>
  )
}
