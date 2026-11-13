import React, { useMemo, useRef, useState } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useMyProfile } from '../../../../hooks/useMyProfile'
import { useUserSettings } from '../../../../hooks/useUserSettings'
import { Chip, ScreenState } from '../../../../components/ui'
import { shared, theme } from '../../../../constants'
import { DEFAULT_REMINDER_LEAD_MINUTES, NOTIFICATION_TYPE_LABELS, REMINDER_LEAD_OPTIONS } from '../../../../constants/notifications'
import {
  isNotificationTypeEnabled,
  listNotificationPrefsResolved,
  patchNotificationPrefs,
} from '../../../../utils/notificationPrefs'
import { isReminderLead, reminderPreview } from '../../../../utils/reminders'
import type { NotificationPrefs, NotificationType } from '../../../../types'
import { NotificationSettingRow as Row } from '../../../../components/profile/NotificationSettingRow'
import { GameAlertsCard } from '../../../../components/profile/GameAlertsCard'
import { WebPushCard } from '../../../../components/settings/WebPushCard'

export default function NotificationSettingsScreen() {
  useStackBackTitle('Notification settings')
  const me = useMyProfile()
  const { settings, setReminderLead } = useUserSettings()
  const [saveFailed, setSaveFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const raw = me.profile?.notification_prefs
  const prefs = useMemo<NotificationPrefs>(() => ({ in_app: { ...raw?.in_app }, push: { ...raw?.push } }), [raw])

  // Optimistic: the cached profile updates at once and rolls back if the write fails.
  // Each toggle sends the whole prefs object, and `updateProfile` queues a call
  // made while a save is in flight, so the latest toggle's prefs win. Only the
  // latest toggle's outcome is shown: an older failure is superseded by it.
  const toggleSeq = useRef(0)
  async function toggle(channel: keyof NotificationPrefs, type: NotificationType, enabled: boolean) {
    const seq = ++toggleSeq.current
    setSaveFailed(false)
    const saved = await me.updateProfile({ notification_prefs: patchNotificationPrefs(prefs, channel, type, enabled) })
    if (seq === toggleSeq.current) setSaveFailed(!saved)
  }

  // The Reminders card owns event_reminder; the per-type lists show the rest.
  const rows = listNotificationPrefsResolved(prefs).filter(r => r.type !== 'event_reminder')
  const remindersOn = isNotificationTypeEnabled(prefs, 'in_app', 'event_reminder')
  const stored = settings?.reminder_lead_minutes
  const lead = isReminderLead(stored) ? stored : DEFAULT_REMINDER_LEAD_MINUTES
  const preview = reminderPreview(lead)

  const pushRows = (
    <>
        <Row
          key="push_event_reminder"
          label={NOTIFICATION_TYPE_LABELS.event_reminder}
          value={isNotificationTypeEnabled(prefs, 'push', 'event_reminder')}
          disabled={!remindersOn}
          onValueChange={v => void toggle('push', 'event_reminder', v)}
        />
        {rows.map(({ type, push }) => (
          <Row
            key={`push_${type}`}
            label={NOTIFICATION_TYPE_LABELS[type]}
            value={push}
            onValueChange={v => void toggle('push', type, v)}
          />
        ))}
    </>
  )

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await me.refetch({ force: true })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={shared.scrollContentSubpage}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={theme.colors.primary} />
        }
      >
        <ScreenState
          loading={me.isLoading}
          ready={!!me.profile}
          error={me.error ? 'Could not load notification settings. Please try again.' : null}
          onRetry={() => void me.refetch({ force: true })}
        >
          <>
            <Text style={[shared.caption, { marginBottom: theme.spacing.md }]}>
              Choose which updates you want, in the app and as push notifications.
            </Text>
            {saveFailed ? <Text style={shared.errorText}>Could not save settings. Please try again.</Text> : null}
            <GameAlertsCard />
            <View style={[shared.card, { marginTop: theme.spacing.md }]} testID="settings-reminders">
              <Text style={[shared.labelStrong, { marginBottom: theme.spacing.sm }]}>Reminders</Text>
              <Row
                label="Before events I'm going to"
                subtitle="In your inbox, and as a push on your phone"
                value={remindersOn}
                onValueChange={v => void toggle('in_app', 'event_reminder', v)}
                testID="reminders-toggle"
              />
              {remindersOn ? (
                <>
                  <View style={shared.chipRowWrap} role="radiogroup" aria-label="How long before">
                    {REMINDER_LEAD_OPTIONS.map(o => (
                      <Chip
                        key={o.minutes}
                        label={o.label}
                        role="radio"
                        active={lead === o.minutes}
                        onPress={() => { if (lead !== o.minutes) void setReminderLead(o.minutes) }}
                        testID={`reminder-lead-${o.minutes}`}
                      />
                    ))}
                  </View>
                  <View style={shared.reminderPreview} testID="reminder-preview">
                    <Text style={shared.reminderPreviewTitle}>{preview.title}</Text>
                    <Text style={shared.captionStrong}>{preview.body}</Text>
                  </View>
                </>
              ) : null}
            </View>
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <Text style={[shared.labelStrong, { marginBottom: theme.spacing.sm }]}>In-app</Text>
              {rows.map(({ type, in_app }) => (
                <Row
                  key={`in_app_${type}`}
                  label={NOTIFICATION_TYPE_LABELS[type]}
                  value={in_app}
                  onValueChange={v => void toggle('in_app', type, v)}
                />
              ))}
            </View>
            {Platform.OS === 'web' ? (
              // Web push (#189): the switches show once this browser has push on.
              <WebPushCard>{pushRows}</WebPushCard>
            ) : (
              <View style={[shared.card, { marginTop: theme.spacing.md }]}>
                <Text style={[shared.labelStrong, { marginBottom: theme.spacing.sm }]}>Push on this phone</Text>
                {pushRows}
              </View>
            )}
          </>
        </ScreenState>
      </ScrollView>
    </View>
  )
}
