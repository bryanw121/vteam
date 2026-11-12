import type { RefreshControlProps } from 'react-native'
// Native: React Native's own RefreshControl already works. The web build picks
// RefreshControl.web.tsx instead (#35). Import RefreshControl from here, never
// from 'react-native' (a guard test enforces it).
export { RefreshControl } from 'react-native'

/** Web doc-scroll pull-to-refresh (RefreshControl.web.tsx). Native has no doc-scroll mode. */
export function DocPullToRefresh(_props: RefreshControlProps): null {
  return null
}
