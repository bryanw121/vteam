import React, { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../components/ui/Text'
import { ScreenContainer } from '../../components/ui'
import { Button } from '../../components/Button'
import { MajorCityAutocomplete } from '../../components/MajorCityAutocomplete'
import { VOLLEYBALL_POSITION_OPTIONS, VOLLEYBALL_SKILL_LEVEL_OPTIONS } from '../../components/profile/options'
import { shared, theme, ANALYTICS_EVENTS, DEFAULT_FEED_REGION, tourCompletionId } from '../../constants'
import { PLAYER_SETUP_COPY as COPY, SKILL_LEVEL_HINTS } from '../../constants/copy'
import { useSession } from '../../contexts/session'
import { useTour } from '../../contexts/tour'
import { useMyProfile } from '../../hooks/useMyProfile'
import { markBannerSeenOnAccount, useUserSettings } from '../../hooks/useUserSettings'
import { track } from '../../lib/analytics'
import { loadSeenBanners, markBannerSeenOnDevice } from '../../utils/seenBanners'
import { PLAYER_SETUP_MARKER, PLAYER_SETUP_STEPS } from '../../utils/playerSetup'
import { isAppPath, routes, toRoute } from '../../utils/routes'
import type { MajorCity, VolleyballPosition, VolleyballSkillLevel } from '../../types'

/** Most positions a player ranks (same as the profile editor). */
const MAX_POSITIONS = 3

/**
 * Player setup after sign-up (#156): what you play, your level, where you
 * play. Every step is optional; values save on Next, so leaving midway keeps
 * what was entered. Done or Skip records PLAYER_SETUP_MARKER (device and
 * account) and goes to `next`.
 */
export default function WelcomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { next } = useLocalSearchParams<{ next?: string }>()
  const target = isAppPath(next) && !next.startsWith('/welcome') ? next : routes.app()
  const { userId } = useSession()
  const { profile, updateProfile } = useMyProfile()
  const { settings, setHomeCity } = useUserSettings()
  const tour = useTour()

  const [step, setStep] = useState(0)
  const [positions, setPositions] = useState<VolleyballPosition[]>([])
  const [level, setLevel] = useState<VolleyballSkillLevel | null>(null)
  const [city, setCity] = useState<MajorCity | null>(null)

  // Start from whatever is already saved (another device, an earlier exit).
  useEffect(() => {
    if (profile?.position?.length) setPositions([...profile.position])
    if (profile?.skill_level) setLevel(profile.skill_level)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (settings?.home_city) setCity(settings.home_city)
  }, [settings?.home_city?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { track(ANALYTICS_EVENTS.playerSetupShown) }, [])

  const stepName = PLAYER_SETUP_STEPS[step]
  const last = step === PLAYER_SETUP_STEPS.length - 1

  const finish = useCallback(() => {
    markBannerSeenOnDevice(PLAYER_SETUP_MARKER)
    if (userId) void markBannerSeenOnAccount(userId, PLAYER_SETUP_MARKER)
    router.replace(toRoute(target))
  }, [router, target, userId])

  const skip = useCallback(() => {
    track(ANALYTICS_EVENTS.playerSetupSkipped, { step: stepName })
    finish()
  }, [finish, stepName])

  const goNext = useCallback(() => {
    track(ANALYTICS_EVENTS.playerSetupStepDone, { step: stepName })
    if (stepName === 'position' && positions.length > 0) void updateProfile({ position: positions })
    if (stepName === 'level' && level) void updateProfile({ skill_level: level })
    if (stepName === 'city' && city) void setHomeCity(city)
    if (!last) { setStep(s => s + 1); return }
    track(ANALYTICS_EVENTS.playerSetupCompleted)
    finish()
    // The intro tour next, unless it was already taken on this device.
    void loadSeenBanners().then(seen => {
      if (!seen.has(tourCompletionId('intro'))) setTimeout(() => tour.start('intro', 'other'), 600)
    })
  }, [city, finish, last, level, positions, setHomeCity, stepName, tour, updateProfile])

  const goBack = useCallback(() => setStep(s => Math.max(0, s - 1)), [])

  // Desktop web: Enter = Next, Escape = Skip.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
      else if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'INPUT') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, skip])

  function togglePosition(value: VolleyballPosition) {
    setPositions(prev => prev.includes(value)
      ? prev.filter(p => p !== value)
      : prev.length >= MAX_POSITIONS ? prev : [...prev, value])
  }

  // The pilot region (outside sessions in the feed today), named for people.
  const liveCity = DEFAULT_FEED_REGION === 'austin' ? 'Austin' : null

  return (
    <View style={[shared.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScreenContainer maxWidth={520}>
        <View style={[shared.rowBetween, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
          <Text style={shared.caption} testID="welcome-step-label">{COPY.stepOf(step + 1, PLAYER_SETUP_STEPS.length)}</Text>
          <Pressable onPress={skip} accessibilityRole="button" hitSlop={12} style={shared.welcomeSkip} testID="welcome-skip">
            <Text style={shared.welcomeSkipText}>{COPY.skip}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={shared.welcomeBody} keyboardShouldPersistTaps="handled">
          {stepName === 'position' && (
            <>
              <Text style={shared.welcomeTitle} accessibilityRole="header">{COPY.positionTitle}</Text>
              <Text style={shared.welcomeLead}>{COPY.positionBody}</Text>
              <View style={shared.welcomeOptions}>
                {VOLLEYBALL_POSITION_OPTIONS.map(opt => {
                  const on = positions.includes(opt.value)
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => togglePosition(opt.value)}
                      role="checkbox"
                      aria-checked={on}
                      aria-label={opt.label}
                      style={[shared.welcomeOption, on && shared.welcomeOptionOn]}
                      testID={`welcome-position-${opt.value}`}
                    >
                      <Text style={[shared.welcomeOptionLabel, on && shared.welcomeOptionLabelOn]}>{opt.label}</Text>
                    </Pressable>
                  )
                })}
                <Pressable
                  onPress={() => setPositions([])}
                  role="checkbox"
                  aria-checked={positions.length === 0}
                  aria-label={COPY.notSure}
                  style={[shared.welcomeOption, positions.length === 0 && shared.welcomeOptionOn]}
                  testID="welcome-position-none"
                >
                  <Text style={[shared.welcomeOptionLabel, positions.length === 0 && shared.welcomeOptionLabelOn]}>{COPY.notSure}</Text>
                </Pressable>
              </View>
            </>
          )}

          {stepName === 'level' && (
            <>
              <Text style={shared.welcomeTitle} accessibilityRole="header">{COPY.levelTitle}</Text>
              <Text style={shared.welcomeLead}>{COPY.levelBody}</Text>
              <View role="radiogroup" aria-label={COPY.levelTitle} style={{ gap: theme.spacing.sm }}>
                {VOLLEYBALL_SKILL_LEVEL_OPTIONS.map(opt => {
                  const on = level === opt.value
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setLevel(on ? null : opt.value)}
                      role="radio"
                      aria-checked={on}
                      aria-label={`${opt.label}: ${SKILL_LEVEL_HINTS[opt.value]}`}
                      style={[shared.welcomeLevelRow, on && shared.welcomeOptionOn]}
                      testID={`welcome-level-${opt.value}`}
                    >
                      <Text style={[shared.welcomeOptionLabel, on && shared.welcomeOptionLabelOn]}>{opt.label}</Text>
                      <Text style={shared.welcomeHint}>{SKILL_LEVEL_HINTS[opt.value]}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          )}

          {stepName === 'city' && (
            <>
              <Text style={shared.welcomeTitle} accessibilityRole="header">{COPY.cityTitle}</Text>
              <Text style={shared.welcomeLead}>{COPY.cityBody}</Text>
              <MajorCityAutocomplete label={COPY.cityLabel} value={city} onChange={setCity} />
              {liveCity && (
                <View style={[shared.row, { gap: theme.spacing.sm, marginTop: theme.spacing.md }]}>
                  <Text style={shared.welcomeLiveTag}>{COPY.liveNow}</Text>
                  <Text style={[shared.caption, { flex: 1 }]}>{COPY.liveNowNote(liveCity)}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View style={shared.welcomeFooter}>
          <View style={shared.welcomeDots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {PLAYER_SETUP_STEPS.map((s, i) => (
              <View key={s} style={[shared.welcomeDot, i === step && shared.welcomeDotOn]} />
            ))}
          </View>
          <View style={[shared.row, { gap: theme.spacing.sm }]}>
            {step > 0 && (
              <View style={{ flex: 1 }}>
                <Button label={COPY.back} onPress={goBack} variant="secondary" testID="welcome-back" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button label={last ? COPY.done : COPY.next} onPress={goNext} testID="welcome-next" />
            </View>
          </View>
        </View>
      </ScreenContainer>
    </View>
  )
}
