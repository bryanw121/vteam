import { useRef, useState } from 'react'
import type { TextInput } from '../../components/ui/Text'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { clubFormFromClub, clubUpdateColumns, hasClubFormErrors, validateClubForm } from '../../utils/clubForm'
import type { ClubForm, ClubFormErrors, ClubWithDetails } from '../../types'

const EMPTY: ClubForm = { name: '', description: '', majorCity: null, location: null }

/**
 * The owner's edit form on a club page (#305): opens with the club's values, shows errors
 * under the fields (no alerts: they do nothing on the web, #228), saves the `clubs` row and
 * calls `onSaved` so the page and the Clubs list refetch.
 */
export function useClubEdit(club: ClubWithDetails | null, onSaved: () => void) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ClubForm>(EMPTY)
  const [errors, setErrors] = useState<ClubFormErrors>({})
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<TextInput>(null)

  function start() {
    if (!club) return
    setForm(clubFormFromClub(club))
    setErrors({})
    setEditing(true)
  }

  function change(patch: Partial<ClubForm>) {
    setForm(f => ({ ...f, ...patch }))
    setErrors(e => ({
      ...e,
      ...('name' in patch ? { name: undefined } : null),
      ...('majorCity' in patch ? { metro: undefined } : null),
    }))
  }

  async function save() {
    if (!club) return
    const found = validateClubForm(form)
    setErrors(found)
    if (found.name) { nameRef.current?.focus(); return }
    if (hasClubFormErrors(found)) return
    setSaving(true)
    const { error } = await supabase.from('clubs').update(clubUpdateColumns(form)).eq('id', club.id)
    setSaving(false)
    if (error) toast.error("Couldn't save the club", error)
    else { setEditing(false); onSaved() }
  }

  return { editing, form, errors, saving, nameRef, start, cancel: () => setEditing(false), change, save }
}
