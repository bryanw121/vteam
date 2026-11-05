import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenContainer, ScreenHeader } from '../ui'
import { shared, theme } from '../../constants'
import { LegalDocument } from './LegalDocument'

type Props = {
  title: string
  markdown: string
  onBack: () => void
}

/** Full-screen, public policy page with a back row. Centered and width-capped on desktop web. */
export function LegalScreen({ title, markdown, onBack }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[shared.screen, { paddingTop: insets.top }]}>
      <ScreenContainer maxWidth={760}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xl }}>
          <ScreenHeader kicker="vteam" title={title} onBack={onBack} />
          <LegalDocument markdown={markdown} />
        </ScrollView>
      </ScreenContainer>
    </View>
  )
}
