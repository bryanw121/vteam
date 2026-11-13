import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation } from '../lib/query'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import type { ReportUserInput } from '../types'

/**
 * Report a player (#243) through `report_user()`: signed-in only, never yourself, 10 a day,
 * one open report per person and context. Throws on failure so the sheet can show it.
 */
export async function reportUser(input: ReportUserInput): Promise<string> {
  const { data, error } = await supabase.rpc('report_user', {
    p_target: input.targetId,
    p_kind: input.kind,
    p_context_id: input.contextId ?? undefined,
    p_reason: input.reason,
    p_details: input.details?.trim() || undefined,
  })
  if (error) throw error
  track(ANALYTICS_EVENTS.reportSent, { kind: input.kind, reason: input.reason })
  return data as string
}

export function useReportUser() {
  const { mutate, isPending, error } = useMutation(reportUser)
  const send = useCallback((input: ReportUserInput) => mutate(input), [mutate])
  return { send, isPending, error }
}
