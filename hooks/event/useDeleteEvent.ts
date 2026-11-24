import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useMutation } from '../../lib/query'
import { toast } from '../../lib/toast'
import { routes } from '../../utils/routes'
import { forgetDeletedEvent } from './keys'
import { reportEventError } from './telemetry'

/** A host deletes their event (#354: the write moved out of the screen): back to Events, cached copies dropped. */
export function useDeleteEvent(eventId: string, userId: string | null) {
  const router = useRouter()
  return useMutation(
    async () => {
      const { error } = await supabase.from('events').delete().eq('id', eventId)
      if (error) throw error
    },
    {
      onSuccess: () => {
        router.replace(routes.events())
        forgetDeletedEvent(eventId)
      },
      onError: e => {
        reportEventError(eventId, userId, 'confirmDelete', e)
        toast.error("Couldn't delete the event", e)
      },
    },
  )
}
