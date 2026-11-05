import { useCallback, useRef, useState } from 'react'
import { checkSession, decideSessionLink } from '../lib/schelagg'
import { openExternalUrl } from '../lib/openExternalUrl'
import type { ExternalSession, SessionLinkDecision, SessionLinkNotice } from '../types'

/**
 * Opening an outside session's sign-up link, with a last-mile check first:
 * Schelagg's /api/check (≤ SESSION_CHECK_TIMEOUT_MS) says whether the venue
 * still lists it. Cancelled, gone or changed → `notice` asks before opening;
 * anything else (scheduled, unknown, an error, a timeout) opens straight away.
 *
 * `finding` keeps the last cancelled / gone / changed result so the card can
 * show it after the dialog closes.
 */
export function useOutsideSessionLink(session: Pick<ExternalSession, 'id' | 'signup_url'>) {
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState<SessionLinkNotice | null>(null)
  const [finding, setFinding] = useState<Exclude<SessionLinkDecision, { action: 'open' }> | null>(null)
  const inFlight = useRef(false)
  const url = session.signup_url

  const openNow = useCallback(async (target: string | null = url) => {
    if (!target) return
    const opened = await openExternalUrl(target)
    // The browser blocked the new tab: a fresh tap on the dialog's button will open it.
    if (!opened) setNotice({ action: 'confirm', kind: 'blocked' })
  }, [url])

  const open = useCallback(async () => {
    if (!url || inFlight.current) return
    inFlight.current = true
    setChecking(true)
    try {
      const decision = decideSessionLink(await checkSession(session.id))
      if (decision.action === 'open') {
        await openNow(url)
      } else {
        setFinding(decision)
        setNotice(decision)
      }
    } finally {
      inFlight.current = false
      setChecking(false)
    }
  }, [url, session.id, openNow])

  const dismiss = useCallback(() => setNotice(null), [])

  /**
   * The dialog's confirm: open the venue page anyway (a fresh tap, so no popup
   * block). A moved session may have a new sign-up link: use it.
   */
  const openAnyway = useCallback(() => {
    const target = finding?.kind === 'changed' && finding.signupUrl ? finding.signupUrl : url
    setNotice(null)
    void openNow(target)
  }, [openNow, finding, url])

  return { open, checking, notice, finding, dismiss, openAnyway }
}
