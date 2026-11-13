import React, { useState } from 'react'
import { Modal, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../ui/Text'
import { DatePickerField } from '../DatePickerField'
import { LocationPickerField } from '../LocationPickerField'
import { DURATION_OPTIONS, shared, theme } from '../../constants'
import type { HostBasicsSectionProps } from '../../types'

/** Title, location, date & time, duration. */
export function BasicsSection({ form, setField, userId, recentVenues, onChangeDate }: HostBasicsSectionProps) {
  const [durationModalOpen, setDurationModalOpen] = useState(false)
  return (
    <>
      {/* ── Title ── */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Title</Text>
        <TextInput
          value={form.title}
          onChangeText={v => setField('title', v)}
          placeholder="Friday Night Round Robin"
          placeholderTextColor={theme.colors.subtext}
          style={shared.hostFieldInput}
        />
      </View>

      {/* ── Location ── */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Location</Text>
        <LocationPickerField
          value={form.location ? { display: form.location, latitude: form.locationLatitude, longitude: form.locationLongitude } : null}
          onChange={loc => {
            setField('location', loc.display)
            setField('locationLatitude', loc.latitude)
            setField('locationLongitude', loc.longitude)
          }}
          userId={userId}
          recentVenues={recentVenues}
        />
      </View>

      {/* ── Date + Time (DatePickerField handles both) ── */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Date & Time</Text>
        <DatePickerField value={form.date} onChange={onChangeDate} />
      </View>

      {/* ── Duration ── */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Duration</Text>
        <TouchableOpacity
          onPress={() => setDurationModalOpen(true)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}
        >
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.lgs, color: theme.colors.text, fontWeight: '500' }}>
            {DURATION_OPTIONS.find(o => o.minutes === form.durationMinutes)?.label ?? 'Select'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.subtext} />
        </TouchableOpacity>
        <Modal visible={durationModalOpen} transparent animationType="fade" onRequestClose={() => setDurationModalOpen(false)}>
          <TouchableOpacity style={shared.modalOverlay} activeOpacity={1} onPress={() => setDurationModalOpen(false)}>
            <View style={[shared.modalCard, { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden', minWidth: 200 }]}>
              {DURATION_OPTIONS.map((opt, i) => {
                const active = form.durationMinutes === opt.minutes
                return (
                  <TouchableOpacity
                    key={opt.minutes}
                    onPress={() => { setField('durationMinutes', opt.minutes); setDurationModalOpen(false) }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: theme.colors.border }}
                  >
                    <Text style={{ fontSize: theme.font.size.md, color: active ? theme.colors.primary : theme.colors.text, fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular }}>
                      {opt.label}
                    </Text>
                    {active && <Ionicons name="checkmark" size={16} color={theme.colors.primary} />}
                  </TouchableOpacity>
                )
              })}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </>
  )
}
