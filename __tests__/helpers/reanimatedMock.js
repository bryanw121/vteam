// A small stand-in for react-native-reanimated under Jest. Reanimated 4.7's own
// `react-native-reanimated/mock` initialises its native CSS module and throws in Jest.
// Covers what the app uses: Animated.View, useSharedValue, useAnimatedStyle, withSpring, runOnJS.
const React = require('react')
const { View, Text, ScrollView, Image } = require('react-native')

const useSharedValue = initial => React.useRef({ value: initial }).current
const useAnimatedStyle = factory => {
  try { return factory() } catch { return {} }
}
const passthrough = value => value

const Animated = {
  View,
  Text,
  ScrollView,
  Image,
  createAnimatedComponent: component => component,
}

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue: factory => ({ value: factory() }),
  useAnimatedScrollHandler: () => () => {},
  withSpring: passthrough,
  withTiming: passthrough,
  withDelay: (_ms, value) => value,
  withRepeat: passthrough,
  withSequence: (...values) => values[values.length - 1],
  runOnJS: fn => fn,
  runOnUI: fn => fn,
  cancelAnimation: () => {},
  Easing: { linear: passthrough, ease: passthrough, out: passthrough, in: passthrough, inOut: passthrough },
}
