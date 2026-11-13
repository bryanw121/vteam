// A small stand-in for react-native-gesture-handler under Jest. Gesture Handler 3's jestSetup
// still requires a GestureHandlerRootView around every GestureDetector and calls native UI
// runtime bindings that don't exist in Jest; tests only need the tree to render.
const React = require('react')
const RN = require('react-native')

// Every builder method returns the same chainable gesture.
function gesture() {
  const g = new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => g) })
  return g
}

module.exports = {
  __esModule: true,
  GestureHandlerRootView: RN.View,
  GestureDetector: ({ children }) => children,
  Gesture: new Proxy({}, { get: () => gesture }),
  TouchableOpacity: RN.TouchableOpacity,
  TouchableHighlight: RN.TouchableHighlight,
  TouchableWithoutFeedback: RN.TouchableWithoutFeedback,
  Pressable: RN.Pressable,
  ScrollView: RN.ScrollView,
  FlatList: RN.FlatList,
  Swipeable: ({ children }) => children,
  State: {},
  Directions: {},
  gestureHandlerRootHOC: component => component,
}
