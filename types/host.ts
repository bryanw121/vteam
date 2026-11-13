/** Props of the host form's sections (#188 part 3; components/host/*Section). */
import type { CreateEventForm, HostRecurrence, LocationValue, OwnedClubOption, Tag } from './index'

export type SetHostField = <K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) => void

/** Open Play (and later types): one type at a time, tap again to clear. */
export type HostTypeSectionProps = {
  loading: boolean
  tags: Tag[]
  selectedTagIds: string[]
  onChangeTags: (update: (prev: string[]) => string[]) => void
}

/** Title, location, date & time, duration. */
export type HostBasicsSectionProps = {
  form: CreateEventForm
  setField: SetHostField
  userId: string | null
  recentVenues: LocationValue[]
  onChangeDate: (date: Date) => void
}

/** Max players and the skill-level (non-type) tags. */
export type HostPlayersSectionProps = {
  form: CreateEventForm
  setField: SetHostField
  tags: Tag[]
  selectedTagIds: string[]
  onToggleTag: (id: string) => void
}

/** Description, price + Venmo, surface. */
export type HostDetailsSectionProps = {
  form: CreateEventForm
  setField: SetHostField
}

export type HostApprovalSectionProps = {
  value: boolean
  onChange: (value: boolean) => void
}

/** Repeat (create only): cadence, weekdays, until, how many games it makes. */
export type HostRepeatSectionProps = {
  recurrence: HostRecurrence
  onChange: (update: (prev: HostRecurrence) => HostRecurrence) => void
  eventCount: number
}

export type HostClubSectionProps = {
  clubs: OwnedClubOption[]
  selectedClubId: string | null
  onSelect: (clubId: string | null) => void
}

export type HostSaveTemplateSectionProps = {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  name: string
  onChangeName: (name: string) => void
  placeholder: string
}

export type HostSaveOutcome = 'saved' | 'tags-failed' | 'tags-uncertain' | 'failed'

export type HostResultModalProps = {
  visible: boolean
  outcome: HostSaveOutcome
  message: string
  isEdit: boolean
  onClose: () => void
  /** "Done" after a successful save. */
  onDone: () => void
}

export type HostSubmitButtonProps = {
  disabled: boolean
  busy: boolean
  label: string
  onPress: () => void
}
