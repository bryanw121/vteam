import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { invalidate, queryKey } from '../../lib/query'
import { toast } from '../../lib/toast'

/** Delete a club the viewer owns (#305): a confirm dialog's state, then the delete and `onDeleted` (leave the page). */
export function useDeleteClub(clubId: string, onDeleted: () => void) {
  const [visible, setVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function confirm() {
    setDeleting(true)
    const { error } = await supabase.from('clubs').delete().eq('id', clubId)
    setDeleting(false)
    if (error) { toast.error("Couldn't delete the club", error); return }
    setVisible(false)
    // Mark stale without refetching: this page is about to close, and a refetch
    // would briefly render "Club not found".
    invalidate(queryKey('club', clubId), { refetchActive: false })
    invalidate('clubs')
    onDeleted()
  }

  return { visible, deleting, open: () => setVisible(true), close: () => { if (!deleting) setVisible(false) }, confirm }
}
