import { GestureHandlerRootView } from 'react-native-gesture-handler'

/**
 * The app's gesture root. Native needs GestureHandlerRootView at the top; the
 * web variant (GestureRoot.web.tsx) is a plain View so Gesture Handler stays
 * out of the web entry chunk (#193): web screens that use gestures load it in
 * their own chunk and wrap themselves.
 */
export const GestureRoot = GestureHandlerRootView
