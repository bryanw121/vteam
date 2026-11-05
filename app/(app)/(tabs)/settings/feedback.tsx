import React, { useCallback, useState } from 'react'
import { Alert, Modal, ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { getSessionUser } from '../../../../lib/sessionUser'
import { emailFeedback } from '../../../../lib/feedback'
import { Button } from '../../../../components/Button'
import { Input } from '../../../../components/Input'
import { shared, theme } from '../../../../constants'
import type { FeedbackKind, FeedbackPriority } from '../../../../types'

export default function FeedbackScreen() {
  useStackBackTitle('Submit feedback')
  const [kind, setKind] = useState<FeedbackKind>('feature')
  const [priority, setPriority] = useState<FeedbackPriority>('medium')
  const [platform, setPlatform] = useState<string | null>(null)
  const [deviceType, setDeviceType] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const handleScrollRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 350)
  }, [])

  async function submit() {
    try {
      if (!title.trim()) return Alert.alert('Missing info', 'Please add a short title.')
      if (!description.trim()) return Alert.alert('Missing info', 'Please add a description.')
      if (kind === 'bug' && !platform) return Alert.alert('Missing info', 'Please select the platform where you saw the bug.')

      setLoading(true)
      setFeedbackError(null)
      const user = await getSessionUser()
      if (!user) throw new Error('Not logged in')

      const bugMeta = kind === 'bug'
        ? [platform && `Platform: ${platform}`, deviceType.trim() && `Device: ${deviceType.trim()}`].filter(Boolean).join('\n')
        : ''
      const fullDescription = bugMeta
        ? `${bugMeta}\n\n${description.trim()}`
        : description.trim()

      const { data: row, error } = await supabase.from('feedback_submissions').insert({
        user_id: user.id,
        kind,
        priority,
        title: title.trim(),
        description: fullDescription,
      }).select('id').single()
      if (error) throw error
      // Saved: that's what the person sees as success. Emailing it to the team
      // happens server-side and never blocks or fails the form.
      emailFeedback(row.id)

      setKind('feature')
      setPriority('medium')
      setPlatform(null)
      setDeviceType('')
      setTitle('')
      setDescription('')
      setFeedbackSubmitted(true)
    } catch (e: any) {
      setFeedbackError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={shared.screen}>
      <Modal visible={feedbackSubmitted} transparent animationType="none" onRequestClose={() => setFeedbackSubmitted(false)}>
        <TouchableOpacity style={shared.modalOverlay} onPress={() => setFeedbackSubmitted(false)}>
          <View style={shared.modalCard}>
            <Text style={shared.modalEmoji}>🏐</Text>
            <Text style={shared.modalTitle}>Thanks for making vteam better!</Text>
            <Text style={shared.modalBody}>Your feedback reached the team. We read every one.</Text>
            <TouchableOpacity style={shared.modalButton} onPress={() => setFeedbackSubmitted(false)}>
              <Text style={shared.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView
        contentContainerStyle={shared.scrollContentSubpage}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleScrollRefresh} tintColor={theme.colors.primary} />
        }
      >
        <View style={shared.card}>
          <Text style={shared.label}>Type</Text>
          <ChoiceRow<FeedbackKind>
            value={kind}
            onChange={v => { setKind(v); setPlatform(null) }}
            options={[
              { value: 'feature', label: 'Feature' },
              { value: 'bug', label: 'Bug' },
            ]}
          />

          {kind === 'bug' && (
            <>
              <View style={shared.mt_md} />
              <Text style={shared.label}>Platform</Text>
              <ChoiceRow<string>
                value={platform ?? ''}
                onChange={setPlatform}
                options={[
                  { value: 'iOS', label: 'iOS' },
                  { value: 'Android', label: 'Android' },
                  { value: 'Mobile web', label: 'Mobile web' },
                  { value: 'Desktop web', label: 'Desktop web' },
                ]}
              />
              <View style={shared.mt_md} />
              <Input
                label="Device (optional)"
                value={deviceType}
                onChangeText={setDeviceType}
                placeholder="e.g. iPhone 15 Pro, Samsung Galaxy S23"
              />
            </>
          )}

          <View style={shared.mt_md} />

          <Text style={shared.label}>Priority</Text>
          <ChoiceRow<FeedbackPriority>
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />

          <View style={shared.mt_md} />

          <Input
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Short summary"
          />

          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What should happen? What happened? Steps to reproduce?"
            multiline
            numberOfLines={6}
          />

          <View style={shared.mt_md} />

          <Button label="Submit" onPress={submit} loading={loading} disabled={loading} />

          {feedbackError ? (
            <Text style={[shared.mt_sm, shared.errorText]}>{feedbackError}</Text>
          ) : null}

          <View style={shared.mt_sm} />
          <Text style={shared.caption}>
            Your submission is saved and emailed to the vteam team.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function ChoiceRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <Button
            key={opt.value}
            label={opt.label}
            onPress={() => onChange(opt.value)}
            variant={active ? 'primary' : 'secondary'}
          />
        )
      })}
    </View>
  )
}
