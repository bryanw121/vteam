import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg'
import { Text } from '../ui/Text'
import { theme } from '../../constants'
import { SPLASH_CAPTION, SPLASH_TIPS } from '../../constants/copy'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { BALL_SEAMS, LOGO_TILE, LOGO_V_POINTS, LOGO_V_TRANSFORM, WORDMARK } from './logo'

const DROP = 110
const TIP_MS = 3000

/**
 * Native loading screen: the same scene as AppSplashContent.web.tsx with core
 * Animated (native driver). A bouncing volleyball, then the mark pops in and
 * "vteam" drops in letter by letter; tips rotate if it takes a while.
 */
export function AppSplashContent() {
  const reduced = useReducedMotion()
  const fall = useRef(new Animated.Value(0)).current // 0 = top of the bounce, 1 = on the floor
  const spin = useRef(new Animated.Value(0)).current
  const brand = useRef(WORDMARK.map(() => new Animated.Value(reduced ? 1 : 0))).current
  const mark = useRef(new Animated.Value(reduced ? 1 : 0)).current
  const [tip, setTip] = useState(-1)

  useEffect(() => {
    if (reduced) return
    const bounce = Animated.loop(Animated.sequence([
      Animated.timing(fall, { toValue: 1, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(fall, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(fall, { toValue: 0, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]))
    const turn = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }))
    const intro = Animated.parallel([
      Animated.spring(mark, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.stagger(80, brand.map(v => Animated.spring(v, { toValue: 1, friction: 5, tension: 90, delay: 150, useNativeDriver: true }))),
    ])
    bounce.start(); turn.start(); intro.start()
    return () => { bounce.stop(); turn.stop(); intro.stop() }
  }, [reduced, fall, spin, mark, brand])

  useEffect(() => {
    const first = setTimeout(() => setTip(0), 1200)
    const next = setInterval(() => setTip(t => (t + 1) % SPLASH_TIPS.length), TIP_MS)
    return () => { clearTimeout(first); clearInterval(next) }
  }, [])

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-DROP, 0] })
  const scaleX = fall.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 1.18] })
  const scaleY = fall.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0.82] })
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const shadowScale = fall.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.1] })
  const shadowOpacity = fall.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })

  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="vteam is loading">
      <View style={styles.stage} importantForAccessibility="no-hide-descendants">
        <Animated.View style={{ transform: [{ translateY }, { translateY: 38 }, { scaleX }, { scaleY }, { translateY: -38 }] }}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Svg width={76} height={76} viewBox="0 0 84 84">
              <Circle cx={42} cy={42} r={40} fill={theme.colors.card} stroke={theme.colors.primaryText} strokeWidth={3} />
              <Path d={BALL_SEAMS} fill="none" stroke={theme.colors.primaryText} strokeWidth={3} strokeLinecap="round" />
            </Svg>
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.shadow, { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] }]} />
      </View>
      <View style={styles.brand}>
        <Animated.View style={{ opacity: mark, transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
          <Svg width={56} height={56} viewBox="0 0 100 100">
            <Rect width={100} height={100} rx={23} fill={LOGO_TILE} />
            <Polygon transform={LOGO_V_TRANSFORM} points={LOGO_V_POINTS} fill={theme.colors.white} />
          </Svg>
        </Animated.View>
        <View style={styles.word} importantForAccessibility="no-hide-descendants">
          {WORDMARK.map((l, i) => (
            <Animated.View key={i} style={{ opacity: brand[i], transform: [{ translateY: brand[i].interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }) }] }}>
              <Text style={styles.letter} maxFontSizeMultiplier={1}>{l}</Text>
            </Animated.View>
          ))}
        </View>
        <View style={styles.beta}><Text style={styles.betaText} maxFontSizeMultiplier={1}>BETA</Text></View>
      </View>
      <Text style={styles.caption}>{SPLASH_CAPTION}</Text>
      <View style={styles.tips}>
        {tip >= 0 && <Text style={styles.tip}>Tip: {SPLASH_TIPS[tip]}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  stage: { width: 160, height: 170, alignItems: 'center', justifyContent: 'flex-end' },
  shadow: { width: 80, height: 10, marginTop: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.overlay },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28 },
  word: { flexDirection: 'row' },
  letter: { fontFamily: theme.fonts.display, fontSize: theme.font.heading.splash, letterSpacing: -1.5, color: theme.colors.text },
  beta: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.colors.primarySoft },
  betaText: { fontFamily: theme.fonts.bodyBold, fontSize: theme.font.size.xs, letterSpacing: 1.2, color: theme.colors.primaryText },
  caption: { marginTop: 14, fontFamily: theme.fonts.body, fontSize: theme.font.size.base, color: theme.colors.subtext },
  tips: { position: 'absolute', left: 24, right: 24, bottom: 56, alignItems: 'center' },
  tip: { textAlign: 'center', fontFamily: theme.fonts.body, fontSize: theme.font.size.md, lineHeight: 20, color: theme.colors.subtext },
})
