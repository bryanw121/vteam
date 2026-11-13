import React, { useState } from 'react'
import { Switch, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../ui/Text'
import { BottomSheet, Chip } from '../ui'
import { DatePickerField } from '../DatePickerField'
import { shared, theme } from '../../constants'
import { EVENT_TIME_ZONE } from '../../constants/time'
import { useClubPollActions } from '../../hooks/useClubPollActions'
import {
  POLL_DEFAULT_OPEN_HOURS, POLL_MAX_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX,
  pollDraftProblem, pollOptionsPayload,
} from '../../utils/clubPoll'
import type { ClubPollDraftOption, ClubPollKind, PollComposerProps } from '../../types'

const CLOSE_CHOICES: readonly { hours: number | null; label: string }[] = [
  { hours: 24, label: '1 day' },
  { hours: POLL_DEFAULT_OPEN_HOURS, label: '2 days' },
  { hours: 24 * 7, label: '1 week' },
  { hours: null, label: 'No end' },
]

const blank = (): ClubPollDraftOption[] => [{ label: '', startsAt: null }, { label: '', startsAt: null }]

/** New poll (#175), for club owners: question, Dates & times or Text options, multi-pick, close time, notify. */
export function PollComposerSheet({ visible, clubId, onClose, onCreated }: PollComposerProps) {
  const { createPoll, creating } = useClubPollActions(clubId)
  const [question, setQuestion] = useState('')
  const [kind, setKind] = useState<ClubPollKind>('time')
  const [options, setOptions] = useState<ClubPollDraftOption[]>(blank())
  const [multi, setMulti] = useState(true)
  const [closeHours, setCloseHours] = useState<number | null>(POLL_DEFAULT_OPEN_HOURS)
  const [notify, setNotify] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)

  function reset() {
    setQuestion(''); setKind('time'); setOptions(blank()); setMulti(true); setCloseHours(POLL_DEFAULT_OPEN_HOURS); setNotify(true); setProblem(null)
  }

  function close() {
    if (creating) return
    reset()
    onClose()
  }

  function setOption(i: number, patch: Partial<ClubPollDraftOption>) {
    setOptions(prev => prev.map((o, k) => (k === i ? { ...o, ...patch } : o)))
  }

  async function submit() {
    const now = Date.now()
    const closesAt = closeHours ? new Date(now + closeHours * 3_600_000) : null
    const why = pollDraftProblem(question, kind, options, closesAt, now)
    if (why) { setProblem(why); return }
    setProblem(null)
    const id = await createPoll({
      clubId, question, kind, multi, closesAt, notify,
      options: pollOptionsPayload(kind, options, EVENT_TIME_ZONE),
    })
    if (!id) { setProblem("Couldn't post the poll. Check your connection and try again."); return }
    reset()
    onCreated()
    onClose()
  }

  return (
    <BottomSheet visible={visible} onDismiss={close} title="New poll">
      <View style={{ gap: theme.spacing.sm }} testID="poll-composer">
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Which night works next week?"
          placeholderTextColor={theme.colors.subtext}
          maxLength={POLL_QUESTION_MAX}
          style={shared.input}
          accessibilityLabel="Question"
          testID="poll-question"
        />
        <View style={shared.chipRowWrap} role="radiogroup" aria-label="Kind of poll">
          <Chip label="Dates & times" role="radio" active={kind === 'time'} onPress={() => { setKind('time'); setOptions(blank()) }} testID="poll-kind-time" />
          <Chip label="Text" role="radio" active={kind === 'text'} onPress={() => { setKind('text'); setOptions(blank()) }} testID="poll-kind-text" />
        </View>

        {options.map((o, i) => (
          <View key={i} style={shared.pollDraftRow}>
            <View style={{ flex: 1 }}>
              {kind === 'time' ? (
                <DatePickerField value={o.startsAt} onChange={d => setOption(i, { startsAt: d })} />
              ) : (
                <TextInput
                  value={o.label}
                  onChangeText={t => setOption(i, { label: t })}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={theme.colors.subtext}
                  maxLength={POLL_OPTION_MAX}
                  style={shared.input}
                  accessibilityLabel={`Option ${i + 1}`}
                  testID={`poll-draft-option-${i}`}
                />
              )}
            </View>
            {options.length > 2 ? (
              <TouchableOpacity onPress={() => setOptions(prev => prev.filter((_, k) => k !== i))} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Remove option ${i + 1}`}>
                <Ionicons name="close-circle-outline" size={22} color={theme.colors.subtext} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {options.length < POLL_MAX_OPTIONS ? (
          <TouchableOpacity onPress={() => setOptions(prev => [...prev, { label: '', startsAt: null }])} accessibilityRole="button" style={shared.pollAction} testID="poll-add-option">
            <Text style={shared.emptyStateAction}>+ Add option</Text>
          </TouchableOpacity>
        ) : null}

        <View style={shared.pollSwitchRow}>
          <Text style={[shared.body, { flex: 1 }]}>Members can pick more than one</Text>
          <Switch value={multi} onValueChange={setMulti} accessibilityLabel="Members can pick more than one" trackColor={{ false: theme.colors.border, true: theme.colors.primary + '88' }} thumbColor={multi ? theme.colors.primary : theme.colors.card} />
        </View>
        <Text style={shared.label}>Closes after</Text>
        <View style={shared.chipRowWrap} role="radiogroup" aria-label="Closes after">
          {CLOSE_CHOICES.map(c => (
            <Chip key={c.label} label={c.label} role="radio" active={closeHours === c.hours} onPress={() => setCloseHours(c.hours)} />
          ))}
        </View>
        <View style={shared.pollSwitchRow}>
          <Text style={[shared.body, { flex: 1 }]}>Notify members</Text>
          <Switch value={notify} onValueChange={setNotify} accessibilityLabel="Notify members" trackColor={{ false: theme.colors.border, true: theme.colors.primary + '88' }} thumbColor={notify ? theme.colors.primary : theme.colors.card} />
        </View>

        {problem ? <Text style={shared.errorText} role="alert">{problem}</Text> : null}
        <TouchableOpacity
          onPress={() => void submit()}
          disabled={creating}
          style={[shared.buttonBase, shared.buttonPrimary, creating && shared.buttonDisabled]}
          accessibilityRole="button"
          testID="poll-submit"
        >
          <Text style={shared.buttonLabelPrimary}>{creating ? 'Posting…' : 'Post poll'}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  )
}
