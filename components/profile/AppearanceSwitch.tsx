import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { applyAppearance } from '../../lib/appearance'
import { readAppearancePref } from '../../lib/appearanceStore'
import { track } from '../../lib/analytics'
import type { AppearancePref } from '../../types'

/** Light first, as on the mock; the same three choices as Settings → Display. */
const ORDER: readonly { id: AppearancePref; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match device' },
]

/** One-tap light / dark on Profile. Web reloads into the new scheme; native picks it up next launch. */
export function AppearanceSwitch() {
  const [pref, setPref] = useState<AppearancePref>(() => readAppearancePref())
  const [nextLaunch, setNextLaunch] = useState(false)

  const pick = (next: AppearancePref) => {
    if (next === pref) return
    setPref(next)
    const applied = applyAppearance(next)
    track(ANALYTICS_EVENTS.appearanceChanged, { to: next, applied, from: 'profile' })
    setNextLaunch(applied === 'next-launch')
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">Appearance</Text>
      <View role="radiogroup" aria-label="Appearance" style={styles.track}>
        {ORDER.map(opt => {
          const on = opt.id === pref
          return (
            <Pressable
              key={opt.id}
              role="radio"
              aria-checked={on}
              aria-label={opt.label}
              testID={`profile-appearance-${opt.id}`}
              onPress={() => pick(opt.id)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.seg, on ? styles.segOn : hovered && styles.segHover]}
            >
              <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>{opt.label}</Text>
            </Pressable>
          )
        })}
      </View>
      {nextLaunch ? <Text style={styles.note}>Your choice starts the next time you open vteam.</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: theme.spacing.lg },
  title: { fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text, marginBottom: theme.spacing.sm },
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.card },
  seg: { flex: 1, minHeight: 44, borderRadius: theme.radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segOn: { backgroundColor: theme.colors.primary },
  segHover: { backgroundColor: theme.colors.primarySoft },
  segText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.subtext },
  segTextOn: { color: theme.colors.onPrimary },
  note: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: theme.spacing.sm },
})
