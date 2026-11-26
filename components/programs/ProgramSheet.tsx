import { View, TouchableOpacity } from 'react-native'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { ShareLinkButton } from '../ShareLinkButton'
import { SheetRow } from '../events/OutsideSessionSheet'
import { shared, theme } from '../../constants'
import { PROGRAM_SHEET_COPY } from '../../constants/copy'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { formatDate } from '../../utils/dateFormat'
import {
  programDeadline, programDivisions, programPrice, programRelative, programUrgency, programWhen,
} from '../../utils/externalPrograms'
import { programPath, programShareText } from '../../utils/outsideShare'
import { takesFreeAgents } from '../../utils/freeAgents'
import { sheetScoresUrl } from '../../utils/sheetScores'
import { openExternalUrl } from '../../lib/openExternalUrl'
import { openInMaps } from '../../lib/openInMaps'
import { track } from '../../lib/analytics'
import { useToday } from '../../hooks/useToday'
import type { ExternalProgram, ProgramSheetProps } from '../../types'

function ProgramDetails({ program: p, onFindTeam, onScores }: Omit<ProgramSheetProps, 'program' | 'onDismiss' | 'onClosed'> & { program: ExternalProgram }) {
  const today = useToday()
  const kind = p.kind === 'league' ? 'League' : 'Tournament'
  const when = programWhen(p)
  const relative = programRelative(p, today)
  const place = [p.venue, p.address, p.city].filter(Boolean).join(', ')
  const price = programPrice(p)
  const urgency = programUrgency(p, today)
  const deadline = programDeadline(p, today)
  const divisions = programDivisions(p)
  const label = p.status === 'closed' || p.status === 'full' ? `See it at ${p.org}` : `Sign up with ${p.org}`
  const finder = takesFreeAgents(p, today)
  const scores = p.kind === 'tournament' && !!sheetScoresUrl(p.id)
  const checked = p.checked_at ? formatDate(new Date(p.checked_at), { month: 'short', day: 'numeric' }) : null

  return (
    <View testID="program-sheet">
      <Text style={shared.sessionSheetKicker}>{`${kind} run by ${p.org}`}</Text>
      <Text style={shared.sessionSheetTitle} accessibilityRole="header">{p.title}</Text>
      {when ? <SheetRow icon="calendar-outline" main={when} sub={relative} testID="program-sheet-when" /> : null}
      {place ? (
        <SheetRow icon="location-outline" iconColor={theme.colors.cool} main={p.venue ?? p.city ?? place} sub={p.venue ? p.city : null}>
          <TouchableOpacity
            onPress={() => openInMaps(place)}
            accessibilityRole="link"
            accessibilityLabel={`${PROGRAM_SHEET_COPY.directions} to ${place}`}
            style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}
          >
            <Text style={shared.sessionSheetLink}>{PROGRAM_SHEET_COPY.directions} ↗</Text>
          </TouchableOpacity>
        </SheetRow>
      ) : null}
      {price || deadline ? (
        <SheetRow
          icon="pricetag-outline"
          iconColor={theme.colors.success}
          main={price ?? deadline}
          sub={price ? (urgency ? `${urgency} · ${deadline}` : deadline) : urgency}
          testID="program-sheet-price"
        />
      ) : null}
      {divisions ? <SheetRow icon="people-outline" main={divisions} /> : null}
      {p.signup_url ? (
        <Button
          label={`${label} ↗`}
          onPress={() => {
            track(ANALYTICS_EVENTS.outsideLinkOpened, { kind: p.kind, org: p.org, from: 'sheet' })
            void openExternalUrl(p.signup_url!)
          }}
          style={{ marginTop: theme.spacing.md }}
          accessibilityLabel={`${label}, opens their page`}
          testID="program-sheet-signup"
        />
      ) : null}
      <View style={shared.sessionSheetActions}>
        {finder ? (
          <Button label={PROGRAM_SHEET_COPY.findTeam} variant="secondary" icon="people-outline" onPress={() => onFindTeam(p)} fullWidth={false} size="touch" testID="program-sheet-find-team" />
        ) : null}
        {scores ? (
          <Button label={PROGRAM_SHEET_COPY.scores} variant="secondary" icon="trophy-outline" onPress={() => onScores(p)} fullWidth={false} size="touch" testID="program-sheet-scores" />
        ) : null}
        <ShareLinkButton path={programPath(p)} title={p.title} text={programShareText(p, today)} screen="outside_program" testID="program-sheet-share" />
      </View>
      <Text style={shared.sessionSheetFooter}>{`Listed from ${p.org}'s site${checked ? ` · checked ${checked}` : ''}`}</Text>
    </View>
  )
}

/**
 * An outside tournament's or league's details (#395): when, where (with directions), price and
 * deadline, divisions, sign-up at the organizer, Find a team, live scores and Share. Opened from
 * its card or a `?program=<id>` link, which is what sharing one sends.
 */
export function ProgramSheet({ program, onDismiss, onClosed, onFindTeam, onScores }: ProgramSheetProps) {
  return (
    <BottomSheet visible={!!program} onDismiss={onDismiss} onClosed={onClosed} accessibilityLabel={program?.title} maxWidth={560}>
      {program ? <ProgramDetails key={program.id} program={program} onFindTeam={onFindTeam} onScores={onScores} /> : null}
    </BottomSheet>
  )
}
