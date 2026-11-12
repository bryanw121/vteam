import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../../../components/ui/Text'
import { ScreenContainer } from '../../../../components/ui'
import { MatchRow } from '../../../../components/scoresheet/MatchRow'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useSavedMatches } from '../../../../hooks/useSavedMatches'
import { useTabsShell } from '../../../../contexts/tabs'
import { shared, theme } from '../../../../constants'
import { EXPERIMENTS } from '../../../../constants/experiments'
import { routes } from '../../../../utils/routes'

/** Settings → Experimental features: things we're trying out, one card each. */
export default function ExperimentalFeaturesScreen() {
  useStackBackTitle('Experimental features')
  const router = useRouter()
  const { tabBarHeight } = useTabsShell()
  const { live } = useSavedMatches()

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: tabBarHeight + theme.spacing.xl }]}>
        <ScreenContainer>
          <Text style={[shared.body, { color: theme.colors.subtextStrong, marginBottom: theme.spacing.lg }]}>
            Things we're trying out. They may change or go away, and anything you make here is saved on this device only.
          </Text>

          {live.length > 0 && (
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.lg }} testID="experimental-resume">
              {live.slice(0, 3).map(m => (
                <MatchRow key={m.id} match={m} highlight onPress={() => router.push(routes.scorekeeperMatch(m.id))} />
              ))}
            </View>
          )}

          <View style={{ gap: theme.spacing.md }}>
            {EXPERIMENTS.map(exp => (
              <Pressable
                key={exp.id}
                onPress={() => router.push(exp.href)}
                accessibilityRole="button"
                accessibilityLabel={`${exp.title}. ${exp.body}`}
                testID={`experiment-${exp.id}`}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  shared.card,
                  { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
                  (pressed || hovered) && { borderColor: theme.colors.primary },
                ]}
              >
                <View style={{ width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={exp.icon} size={22} color={theme.colors.timeInk} />
                </View>
                <View style={{ flex: 1, gap: theme.spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                    <Text style={shared.subheading}>{exp.title}</Text>
                    <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.radius.full, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={[shared.caption, { color: theme.colors.warning }]}>Beta</Text>
                    </View>
                  </View>
                  <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>{exp.body}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} style={{ alignSelf: 'center' }} />
              </Pressable>
            ))}
          </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  )
}
