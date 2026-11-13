import React from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { Chip } from '../ui'
import { SURFACE_OPTIONS, shared, theme } from '../../constants'
import { normalizePriceText, parsePrice, sanitizePriceInput } from '../../utils'
import type { HostDetailsSectionProps } from '../../types'

/** Description, price + Venmo, surface. */
export function DetailsSection({ form, setField }: HostDetailsSectionProps) {
  return (
    <>
      {/* ── Description ── */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Description (optional)</Text>
        <TextInput
          value={form.description}
          onChangeText={v => setField('description', v)}
          placeholder="What's this event about?"
          placeholderTextColor={theme.colors.subtext}
          multiline
          numberOfLines={3}
          style={[shared.hostFieldInput, { minHeight: 64, textAlignVertical: 'top' }]}
        />
      </View>

      {/* ── Price + Venmo ── */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Price (optional)</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.subtext }}>$</Text>
          <TextInput
            testID="event-price-input"
            // Bound to raw text. Never round-trip through parseFloat on
            // keystroke — that erases a trailing "." and any trailing zero,
            // which is why "5.50" was impossible to type.
            value={form.priceText}
            onChangeText={v => setField('priceText', sanitizePriceInput(v))}
            onBlur={() => setField('priceText', normalizePriceText(form.priceText))}
            placeholder="0.00 — leave blank for free"
            placeholderTextColor={theme.colors.subtext}
            keyboardType="decimal-pad"
            inputMode="decimal"
            style={[shared.hostFieldInput, { flex: 1 }]}
          />
        </View>
        {(parsePrice(form.priceText) ?? 0) > 0 && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 }}>
            <Text style={shared.hostFieldLabel}>Venmo handle (optional)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.subtext }}>@</Text>
              <TextInput
                value={form.venmoHandle}
                onChangeText={v => setField('venmoHandle', v.replace(/^@/, ''))}
                placeholder="your-venmo-username"
                placeholderTextColor={theme.colors.subtext}
                autoCapitalize="none"
                autoCorrect={false}
                style={[shared.hostFieldInput, { flex: 1 }]}
              />
            </View>
          </View>
        )}
      </View>

      {/* ── Surface ── optional; lets the Events feed's surface filter include this event. */}
      <View style={shared.hostFieldCard}>
        <Text style={shared.hostFieldLabel}>Surface</Text>
        <View style={shared.chipRowWrap}>
          {SURFACE_OPTIONS.map(opt => (
            <Chip
              key={opt.id}
              testID={`event-surface-${opt.id}`}
              label={opt.label}
              active={form.surface === opt.id}
              // Tap the selected surface again to clear it.
              onPress={() => setField('surface', form.surface === opt.id ? null : opt.id)}
            />
          ))}
        </View>
        <Text style={shared.caption}>Players can filter the Events feed by surface.</Text>
      </View>
    </>
  )
}
