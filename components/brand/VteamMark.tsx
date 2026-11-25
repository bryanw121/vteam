import Svg, { Polygon, Rect } from 'react-native-svg'
import { theme } from '../../constants'
import { LOGO_TILE, LOGO_V_POINTS, LOGO_V_TRANSFORM } from '../splash/logo'
import type { VteamMarkProps } from '../../types'

/** The vteam mark (assets/branding/vteam-logo.svg): the first V on its tile. */
export function VteamMark({ size, inverted = false }: VteamMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width={100} height={100} rx={23} fill={inverted ? theme.colors.white : LOGO_TILE} />
      <Polygon transform={LOGO_V_TRANSFORM} points={LOGO_V_POINTS} fill={inverted ? LOGO_TILE : theme.colors.white} />
    </Svg>
  )
}
