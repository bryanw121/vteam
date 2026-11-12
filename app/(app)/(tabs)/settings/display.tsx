import { Platform, Pressable, ScrollView, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../../../components/ui/Text'
import { TimePill } from '../../../../components/ui'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useTextScale } from '../../../../contexts/textScale'
import { useTabsShell } from '../../../../contexts/tabs'
import { TEXT_SIZE_OPTIONS, shared, theme } from '../../../../constants'

const OS_NOTE = Platform.select({
  ios: 'This adds to the text size in your iPhone settings.',
  android: 'This adds to the font size in your Android settings.',
  default: "This adds to your browser's font size setting.",
})

/** Settings → Display: the text size setting (#43), with a live preview. */
export default function DisplaySettingsScreen() {
  useStackBackTitle('Display')
  const { size, setSize } = useTextScale()
  // The mobile tab bar floats over the bottom of the screen; keep the preview clear of it.
  const { tabBarHeight } = useTabsShell()

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: tabBarHeight + theme.spacing.xl }]}>
        <Text style={[shared.label, { marginBottom: theme.spacing.sm }]}>Text size</Text>
        <View role="radiogroup" style={[shared.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
          {TEXT_SIZE_OPTIONS.map((opt, idx) => {
            const selected = opt.id === size
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSize(opt.id)}
                role="radio"
                aria-checked={selected}
                aria-label={opt.label}
                testID={`text-size-${opt.id}`}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  shared.settingsOptionRow,
                  idx < TEXT_SIZE_OPTIONS.length - 1 && shared.settingsOptionRowBorder,
                  (pressed || hovered) && { backgroundColor: theme.colors.background },
                ]}
              >
                <Text style={[shared.settingsOptionLabel, selected && { color: theme.colors.text, fontFamily: theme.fonts.bodySemiBold }]}>
                  {opt.label}
                </Text>
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={selected ? theme.colors.primary : theme.colors.subtext}
                />
              </Pressable>
            )
          })}
        </View>
        <Text style={[shared.caption, { marginTop: theme.spacing.sm }]}>
          Changes text across the app on this device. {OS_NOTE}
        </Text>

        <Text style={[shared.label, { marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm }]}>Preview</Text>
        <View testID="text-size-preview" style={[shared.card, { gap: theme.spacing.sm }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <TimePill label="6:30 PM" />
            <Text style={shared.caption}>Sat, Nov 1 · Roots Volleyball</Text>
          </View>
          <Text style={shared.subheading}>Saturday Sand Open Play</Text>
          <Text style={shared.body}>
            Two courts, all levels. Bring water; we rotate teams every 15 minutes.
          </Text>
          <View style={shared.settingsPreviewBubble}>
            <Text style={shared.settingsPreviewBubbleText}>Running 5 minutes late, save me a spot!</Text>
          </View>
          <Text style={shared.caption}>8 of 12 going</Text>
        </View>
      </ScrollView>
    </View>
  )
}
