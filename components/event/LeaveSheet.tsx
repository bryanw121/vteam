import { useEffect, useState } from 'react'
import { Platform, ScrollView, View, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../ui/Text'
import { BottomSheet, Chip, ConfirmDialog } from '../ui'
import { Button } from '../Button'
import { LEAVE_COPY, LEAVE_NOTE_MAX, LEAVE_REASONS, shared, theme } from '../../constants'
import type { LeaveConsequence, LeaveReason } from '../../types'

type Props = {
  visible: boolean
  /** 'sheet' on native and narrow web; 'dialog' (440px ConfirmDialog) on desktop web. */
  layout: 'sheet' | 'dialog'
  /** "Starts in 5 hours · Thu 7:00 PM" (`leaveSubtitle`). */
  subtitle: string
  /** From `leaveConsequences()`: only the lines that apply. */
  lines: LeaveConsequence[]
  hostName: string
  /** Reason chips + note: only when the host will be told (within 24h). */
  showReason: boolean
  /** The leave is in flight. */
  leaving: boolean
  onLeave: (reason: LeaveReason | null, note: string) => void
  /** Stay in, Esc, back, scrim tap. */
  onCancel: () => void
}

const STAY_TEST_ID = 'leave-cancel'

/** Line icon colours, by what the line is about. */
const ICON_COLOR: Record<LeaveConsequence['kind'], string> = {
  waitlist: theme.colors.cool,
  full: theme.colors.cool,
  open: theme.colors.cool,
  approval: theme.colors.cool,
  hostNotified: theme.colors.warning,
  paid: theme.colors.success,
  points: theme.colors.medalGold,
}

/**
 * The heads-up before leaving an event you're attending (#171): what leaving
 * costs, and optionally why, for the host. Presentational: the screen decides
 * the lines and owns the leave and the DM. No navigation here.
 */
export function LeaveSheet({ visible, layout, subtitle, lines, hostName, showReason, leaving, onLeave, onCancel }: Props) {
  const [reason, setReason] = useState<LeaveReason | null>(null)
  const [note, setNote] = useState('')
  const { height } = useWindowDimensions()

  // A fresh sheet every time it opens.
  useEffect(() => {
    if (visible) { setReason(null); setNote('') }
  }, [visible])

  // Focus starts on Stay in (web: keyboard and screen-reader users land on the safe choice).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return
    const t = setTimeout(() => {
      (document.querySelector(`[data-testid="${STAY_TEST_ID}"]`) as HTMLElement | null)?.focus()
    }, 50)
    return () => clearTimeout(t)
  }, [visible])

  const dismiss = () => { if (!leaving) onCancel() }
  const leave = () => onLeave(showReason ? reason : null, showReason ? note : '')
  const prompt = LEAVE_COPY.reasonPrompt.replace('{host}', hostName)

  const body = (
    <>
      <Text style={shared.leaveSubtitle}>{subtitle}</Text>
      <ScrollView style={{ maxHeight: Math.max(240, height * 0.55) }} keyboardShouldPersistTaps="handled">
        <View role="list" style={shared.leaveLines}>
          {lines.map(line => (
            <View key={line.kind} role="listitem" style={shared.leaveLine} testID={`leave-line-${line.kind}`}>
              <Ionicons name={line.icon} size={18} color={ICON_COLOR[line.kind]} style={shared.leaveLineIcon} aria-hidden />
              <Text style={shared.leaveLineText}>
                {line.parts.map((p, i) => (
                  <Text key={i} style={p.strong ? shared.leaveLineStrong : undefined}>{p.text}</Text>
                ))}
              </Text>
            </View>
          ))}
        </View>
        {showReason && (
          <View testID="leave-reason">
            <Text style={shared.leaveReasonLabel}>{prompt}</Text>
            <View role="radiogroup" aria-label={prompt} style={shared.chipRowWrap}>
              {LEAVE_REASONS.map(r => (
                <Chip
                  key={r.id}
                  label={r.label}
                  role="radio"
                  variant="tint"
                  active={reason === r.id}
                  onPress={() => setReason(prev => (prev === r.id ? null : r.id))}
                  testID={`leave-reason-${r.id}`}
                />
              ))}
            </View>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={LEAVE_COPY.notePlaceholder}
              placeholderTextColor={theme.colors.subtext}
              maxLength={LEAVE_NOTE_MAX}
              accessibilityLabel={`Note for ${hostName}`}
              style={[shared.input, shared.leaveNote]}
              testID="leave-note"
            />
          </View>
        )}
      </ScrollView>
    </>
  )

  if (layout === 'dialog') {
    return (
      <ConfirmDialog
        visible={visible}
        title={LEAVE_COPY.title}
        confirmLabel={LEAVE_COPY.leave}
        cancelLabel={LEAVE_COPY.stay}
        destructive
        loading={leaving}
        onConfirm={leave}
        onCancel={dismiss}
        width={440}
        testIDPrefix="leave"
      >
        {body}
      </ConfirmDialog>
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={dismiss} title={LEAVE_COPY.title}>
      {body}
      <View style={shared.leaveActions}>
        <Button label={LEAVE_COPY.leave} variant="danger" onPress={leave} loading={leaving} testID="leave-confirm" />
        <Button label={LEAVE_COPY.stay} variant="secondary" onPress={dismiss} disabled={leaving} testID={STAY_TEST_ID} />
      </View>
    </BottomSheet>
  )
}
