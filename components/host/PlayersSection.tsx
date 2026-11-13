import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { HostPlayersSectionProps, Tag } from '../../types'

/** Max players, then a card per non-type tag category (skill level). */
export function PlayersSection({ form, setField, tags, selectedTagIds, onToggleTag }: HostPlayersSectionProps) {
  const byCategory = tags.reduce<Record<string, Tag[]>>((acc, tag) => {
    if (tag.category === 'event_type') return acc
    ;(acc[tag.category] ??= []).push(tag)
    return acc
  }, {})
  return (
    <>
      {/* ── Max players ── */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Max players</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
          <TextInput
            value={form.maxAttendees != null ? String(form.maxAttendees) : ''}
            onChangeText={v => {
              const digits = v.replace(/[^0-9]/g, '')
              if (digits === '') { setField('maxAttendees', null); return }
              const n = parseInt(digits, 10)
              if (Number.isFinite(n) && n > 0) setField('maxAttendees', n)
            }}
            placeholder="e.g. 18"
            placeholderTextColor={theme.colors.subtext}
            keyboardType="number-pad"
            style={[shared.hostFieldInput, { flex: 1 }]}
          />
          <TouchableOpacity
            onPress={() => setField('maxAttendees', form.maxAttendees === null ? 18 : null)}
            style={[shared.hostChip, form.maxAttendees === null && shared.hostChipActive]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ selected: form.maxAttendees === null }}
            accessibilityLabel="Unlimited players"
          >
            <Text style={[shared.hostChipText, form.maxAttendees === null && shared.hostChipTextActive]}>
              Unlimited
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Skill level tags ── */}
      {Object.entries(byCategory).map(([category, categoryTags]) => (
        <View key={category} style={shared.hostFieldCard}>
          <Text style={shared.hostFieldLabel}>
            {category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {categoryTags.map(tag => {
              const active = selectedTagIds.includes(tag.id)
              return (
                <TouchableOpacity
                  key={tag.id}
                  onPress={() => onToggleTag(tag.id)}
                  style={{
                    paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
                    backgroundColor: active ? theme.colors.text : theme.colors.border,
                  }}
                >
                  <Text style={{
                    fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.smd,
                    color: active ? theme.colors.background : theme.colors.text,
                  }}>{tag.name}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ))}
    </>
  )
}
