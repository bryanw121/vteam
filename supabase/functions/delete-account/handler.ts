/**
 * Edge Function: delete-account
 *
 * Permanently deletes the signed-in user's account (App Store 5.1.1(v), Google Play).
 *
 * POST { confirm: 'DELETE', planHash } with the user's JWT ->
 *   200 { ok: true, plan }          deleted
 *   400 missing confirmation or hash
 *   401 not signed in
 *   403 { code: 'reauth_required' } last sign-in older than 10 minutes: sign in again first
 *   409 { code: 'plan_changed' }    what would be deleted changed since the preview: review again
 *   500 failure (nothing was deleted)
 *
 * The deletion itself is ONE database transaction, public.delete_account(user,
 * planHash): it locks the profile, recomputes the plan and compares its hash
 * with the one the app showed, carries out every hand-over / cancellation /
 * cleanup, and deletes the auth user last. If anything fails, nothing changes.
 * Only after it commits does this function remove the person's files (avatar,
 * chat photos) and the avatars of clubs that were deleted.
 *
 * verify_jwt = true (supabase/config.toml); the user id comes from that JWT
 * (checked again with auth.getUser), never from the request body.
 *
 * index.ts serves this with the real dependencies; handler.test.ts runs it
 * against a fake database and storage.
 */

import type { DbClient, Deps } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import {
  bearerToken,
  DELETE_ERRORS,
  isRecentSignIn,
  jwtPayload,
  lastSignInAt,
  parseDeleteRequest,
  USER_FOLDER_BUCKETS,
} from '../_shared/accountDeletion.ts'

/** Best effort: remove every object under `folder/` in a bucket. */
async function removeFolder(service: DbClient, bucket: string, folder: string) {
  const storage = service.storage.from(bucket)
  for (let round = 0; round < 20; round++) {
    const { data, error } = await storage.list(folder, { limit: 100 })
    if (error || !data?.length) return
    const paths = data.filter((f) => f.name).map((f) => `${folder}/${f.name}`)
    if (!paths.length) return
    const { error: removeError } = await storage.remove(paths)
    if (removeError) {
      console.warn(`[delete-account] could not remove ${bucket}/${folder}:`, removeError.message)
      return
    }
  }
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const cors = { ...corsHeaders(req, deps.env), 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    const json = (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const token = bearerToken(req.headers.get('Authorization'))
    if (!token) return json({ error: 'Sign in to delete your account.' }, 401)

    let body: unknown = null
    try {
      body = await req.json()
    } catch { /* handled below */ }
    const request = parseDeleteRequest(body)
    if (!request) return json({ error: 'Confirmation missing.' }, 400)

    try {
      const service = deps.getClient()
      const { data: userData, error: userError } = await service.auth.getUser(token)
      const userId = userData?.user?.id
      if (userError || !userId) return json({ error: 'Sign in to delete your account.' }, 401)

      if (!isRecentSignIn(lastSignInAt(jwtPayload(token)), Math.floor(deps.now() / 1000))) {
        return json({ code: DELETE_ERRORS.reauthRequired, error: "For your security, confirm it's you before deleting your account." }, 403)
      }

      const { data: plan, error: deleteError } = await service.rpc('delete_account', { p_user: userId, p_plan_hash: request.planHash })
      if (deleteError) {
        if (deleteError.code === 'P0409') {
          return json({ code: DELETE_ERRORS.planChanged, error: 'Something changed since you reviewed this. Please review it again.' }, 409)
        }
        console.error('[delete-account] delete failed:', deleteError.message)
        return json({ error: 'Could not delete your account. Nothing was changed. Please try again.' }, 500)
      }

      // The account is gone (committed). Clean up files; failures here are only logged.
      for (const bucket of USER_FOLDER_BUCKETS) await removeFolder(service, bucket, userId)
      const deletedClubs = ((plan as { clubs?: { id: string; action: string }[] } | null)?.clubs ?? [])
        .filter((c) => c.action === 'delete')
      for (const club of deletedClubs) await removeFolder(service, 'club-avatars', club.id)

      return json({ ok: true, plan }, 200)
    } catch (e) {
      console.error('[delete-account] failed:', (e as Error)?.message)
      return json({ error: 'Could not delete your account. Please try again.' }, 500)
    }
  }
}
