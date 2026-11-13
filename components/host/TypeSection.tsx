import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { HostTypeSectionProps } from '../../types'

const TYPE_META: Record<string, { color: string; subtitle: string }> = {
  'Open Play': { color: theme.colors.primary, subtitle: 'casual' },
}

/** The event type cards at the top of the host form (one type at a time). */
export function TypeSection({ loading, tags, selectedTagIds, onChangeTags }: HostTypeSectionProps) {
  // Tags load beside the form: hold their space so the fields below don't jump.
  if (loading) {
    return (
      <View testID="host-tags-loading" style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <View style={[shared.skeletonBlock, { flex: 1, height: 64, borderRadius: 18 }]} />
      </View>
    )
  }
  const typeTags = tags.filter(t => t.category === 'event_type' && t.name !== 'Tournament')
  if (typeTags.length === 0) return null
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
      {typeTags.map(tag => {
        const meta = TYPE_META[tag.name] ?? { color: theme.colors.primary, subtitle: '' }
        const selected = selectedTagIds.includes(tag.id)
        return (
          <TouchableOpacity
            key={tag.id}
            onPress={() => {
              onChangeTags(prev => {
                const otherTypeIds = typeTags.filter(t => t.id !== tag.id).map(t => t.id)
                const withoutTypes = prev.filter(id => !otherTypeIds.includes(id))
                return withoutTypes.includes(tag.id)
                  ? withoutTypes.filter(id => id !== tag.id)
                  : [...withoutTypes, tag.id]
              })
            }}
            activeOpacity={0.75}
            style={{
              flex: 1, padding: 14, borderRadius: 18,
              backgroundColor: selected ? meta.color : theme.colors.card,
              borderWidth: selected ? 0 : 1.5,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lgm, letterSpacing: -0.3, color: selected ? theme.colors.white : theme.colors.text }}>
              {tag.name}
            </Text>
            {meta.subtitle ? (
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: selected ? 'rgba(255,255,255,0.75)' : theme.colors.subtext, marginTop: 2 }}>
                {meta.subtitle}
              </Text>
            ) : null}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
