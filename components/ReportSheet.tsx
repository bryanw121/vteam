import { useEffect, useState } from 'react'
import { Pressable, Switch, View } from 'react-native'
import { Text, TextInput } from './ui/Text'
import { BottomSheet } from './ui/BottomSheet'
import { Chip } from './ui/Chip'
import { Button } from './Button'
import { theme } from '../constants'
import { REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_REVIEW_HOURS } from '../constants/reports'
import { useReportUser } from '../hooks/useReportUser'
import { toast } from '../lib/toast'
import type { ReportReason, ReportSheetProps } from '../types'

/**
 * Report a player (#243): a reason, optional details, optionally silence them too.
 * Sends through report_user(); the team reviews within REPORT_REVIEW_HOURS.
 */
export function ReportSheet({ visible, onDismiss, target, kind, contextId, offerSilence = false, silenceByDefault = false, onSilence }: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [silence, setSilence] = useState(silenceByDefault)
  const [sent, setSent] = useState(false)
  const { send, isPending } = useReportUser()
  const firstName = target.name.split(' ')[0] || 'them'

  useEffect(() => {
    if (!visible) return
    setReason(null); setDetails(''); setSilence(silenceByDefault); setSent(false)
  }, [visible, silenceByDefault])

  const submit = async () => {
    if (!reason || isPending) return
    const input = { targetId: target.id, kind, contextId, reason, details }
    try {
      const id = await send(input)
      if (id === undefined) throw new Error('report failed')
      if (offerSilence && silence) await onSilence?.()
      setSent(true)
    } catch (e) {
      toast.error("Couldn't send the report", e, { label: 'Try again', onPress: () => void submit() })
    }
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={sent ? 'Report sent' : `Report ${target.name}`}>
      {sent ? (
        <View style={{ gap: theme.spacing.md }} testID="report-sent">
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.text }}>
            {`Thanks. We review reports within ${REPORT_REVIEW_HOURS} hours. ${target.name} won't know who reported them.`}
          </Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
            If someone is in danger right now, contact local emergency services first.
          </Text>
          <Button label="Done" onPress={onDismiss} />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }} testID="report-sheet">
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>What happened?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }} role="radiogroup" aria-label="Reason">
            {REPORT_REASONS.map(r => (
              <Chip key={r.key} label={r.label} active={reason === r.key} role="radio" onPress={() => setReason(r.key)} testID={`report-reason-${r.key}`} />
            ))}
          </View>
          <TextInput
            value={details}
            onChangeText={t => setDetails(t.slice(0, REPORT_DETAILS_MAX))}
            placeholder="Anything else we should know? (optional)"
            placeholderTextColor={theme.colors.subtext}
            multiline
            maxLength={REPORT_DETAILS_MAX}
            accessibilityLabel="Details"
            testID="report-details"
            style={{
              minHeight: 88, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
              padding: theme.spacing.sm, fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.text,
              textAlignVertical: 'top',
            }}
          />
          {offerSilence ? (
            <Pressable
              onPress={() => setSilence(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}
              accessibilityRole="switch"
              accessibilityState={{ checked: silence }}
            >
              <Text style={{ flex: 1, fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.text }}>{`Also silence ${firstName}`}</Text>
              <Switch
                value={silence}
                onValueChange={setSilence}
                accessibilityLabel={`Also silence ${firstName}`}
                testID="report-silence"
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '99' }}
              />
            </Pressable>
          ) : null}
          <Button label="Send report" onPress={() => void submit()} loading={isPending} disabled={!reason} testID="report-send" />
        </View>
      )}
    </BottomSheet>
  )
}
