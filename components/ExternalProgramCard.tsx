import { memo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme, SURFACE_ACCENTS, COMPACT_TEXT_SCALE } from '../constants'
import { TimePill } from './ui'
import { openExternalUrl } from '../lib/openExternalUrl'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { useToday } from '../hooks/useToday'
import { programDateBadge, programDeadline, programKicker, programPrice, programRelative, programUrgency, programWhen } from '../utils/externalPrograms'
import type { ExternalProgramCardProps } from '../types'

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/**
 * A league or tournament run outside vteam (Schelagg's programs feed). Not a vteam event: there's
 * no RSVP here, so the whole card links out to the organizer's sign-up page. Dashed like
 * ExternalSessionCard, so it reads as "elsewhere". Tournaments get a date block spanning every day
 * they're on (Nov · 14–15 · Sat–Sun) and, in lists (`compact`), how soon it is. `compact` leagues
 * have no date block: their list is ordered by sign-up deadline.
 */
function ExternalProgramCardInner({ program: p, compact = false, menuInset = false }: ExternalProgramCardProps) {
  const today = useToday()
  const accent = p.surface ? SURFACE_ACCENTS[p.surface] : theme.colors.subtext
  const urgency = programUrgency(p, today)
  const price = programPrice(p)
  const deadline = programDeadline(p, today)
  const when = programWhen(p)
  const where = [p.venue, p.city].filter(Boolean).join(' · ')
  const [y, m, d] = (p.starts_on ?? today).split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const badge = p.kind === 'tournament' ? programDateBadge(p) : null
  const relative = compact && p.kind === 'tournament' ? programRelative(p, today) : null
  const label = p.status === 'closed' || p.status === 'full' ? `See it at ${p.org}` : `Sign up with ${p.org}`

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => {
        if (!p.signup_url) return
        track(ANALYTICS_EVENTS.outsideLinkOpened, { kind: p.kind, org: p.org })
        void openExternalUrl(p.signup_url)
      }}
      disabled={!p.signup_url}
      style={shared.externalCard}
      accessibilityRole="link"
      accessibilityLabel={[p.title, where, relative, when, price, urgency ?? deadline, label].filter(Boolean).join('. ')}
      testID="external-program-card"
    >
      {badge ? (
        <View style={shared.programDateBlock} testID="external-program-date">
          <Text style={shared.programDateMonth} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{badge.month}</Text>
          <Text style={shared.programDateDays} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{badge.days}</Text>
          {badge.weekdays ? <Text style={shared.programDateWeekdays} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{badge.weekdays}</Text> : null}
        </View>
      ) : !compact && (
        <View style={[shared.externalDateBlock, { backgroundColor: accent + '22' }]}>
          <Text style={[shared.externalDay, { color: accent }]}>{DAYS[start.getDay()]}</Text>
          <Text style={[shared.externalDate, { color: accent }]}>{start.getDate()}</Text>
        </View>
      )}
      <View style={shared.externalBody}>
        <Text style={[shared.externalKicker, menuInset && { paddingRight: 36 }]} numberOfLines={1}>{programKicker(p)}</Text>
        {p.kind === 'tournament' && !compact ? (
          <View style={{ marginBottom: 4 }}>
            <TimePill label="All day" accessibilityLabel="All day" />
          </View>
        ) : null}
        <Text style={shared.externalTitle} numberOfLines={2}>{p.title}</Text>
        {where ? <Text style={shared.externalMeta} numberOfLines={1}>{where}</Text> : null}
        {/* The days it's on, always: a tournament list isn't tied to the selected day. */}
        {when ? (
          <Text style={relative ? shared.programWhen : shared.externalMeta} numberOfLines={2} testID="external-program-when">
            {relative ? `${relative} · ${when}` : when}
          </Text>
        ) : null}
        {price ? <Text style={shared.externalMeta} numberOfLines={1}>{price}</Text> : null}
        {urgency || deadline ? (
          <Text style={urgency ? shared.externalFinding : shared.externalMeta} numberOfLines={1} testID="external-program-deadline">
            {urgency ? `${urgency} · ${deadline}` : deadline}
          </Text>
        ) : null}
        {p.signup_url ? (
          <View style={shared.externalSignup}>
            <Text style={shared.externalSignupLabel}>{label}</Text>
            <Ionicons name="open-outline" size={13} color={theme.colors.text} />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

export const ExternalProgramCard = memo(ExternalProgramCardInner)
