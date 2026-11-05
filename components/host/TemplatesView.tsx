import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { RefreshControl } from '../RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import { ScreenState } from '../ui'
import type { UserEventTemplate } from '../../types'

type Props = {
  templates: UserEventTemplate[] | undefined
  loading: boolean
  /** Message when the templates could not be loaded and none are cached. */
  error: string | null
  refreshing: boolean
  onRefresh: () => void
  onRetry: () => void
  onPick: (template: UserEventTemplate) => void
}

/** "From Template": the host's saved event templates; picking one prefills the form. */
export function TemplatesView({ templates, loading, error, refreshing, onRefresh, onRetry, onPick }: Props) {
  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={shared.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <Text style={[shared.subheading, shared.mb_md]}>My Templates</Text>

      <ScreenState loading={loading} ready={!!templates} error={error} onRetry={onRetry}>
        {!templates || templates.length === 0 ? (
          <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm }]}>
            <Ionicons name="document-outline" size={32} color={theme.colors.subtext} />
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              No templates yet. Create an event and check "Save as template" to save it here.
            </Text>
          </View>
        ) : (
          templates.map(t => (
            <TouchableOpacity key={t.id} onPress={() => onPick(t)} style={[shared.card, { gap: theme.spacing.xs }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={shared.subheading}>{t.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
              </View>
              <Text style={shared.caption}>
                {t.title}{t.location ? ` · ${t.location}` : ''}{t.max_attendees ? ` · ${t.max_attendees} max` : ''}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScreenState>
    </ScrollView>
  )
}
