/**
 * The real outside world for the edge functions: the service-role client and
 * `defaultDeps`, which each `<name>/index.ts` passes to its handler:
 *   Deno.serve(createHandler(defaultDeps))
 *
 * This is the only file that imports supabase-js (from a URL), so handlers
 * and their tests never load it. Import with an explicit `.ts` extension.
 */

// Keep this in step with "@supabase/supabase-js" in package.json
// (__tests__/edgeFunctions.test.ts fails when they drift apart).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3'
import type { DbClient, Deps } from './deps.ts'
import { platformDeps } from './platform.ts'

export { chunk, EXPO_BATCH_SIZE, EXPO_PUSH_URL, EXPO_RECEIPTS_URL, RECEIPT_BATCH } from './expo.ts'

let client: ReturnType<typeof createClient> | null = null

/**
 * Service-role client (bypasses RLS). Created on first use rather than at
 * import time so a missing secret surfaces as a logged 500 for that request
 * instead of a function that fails to boot.
 */
export function getServiceClient() {
  if (client) return client
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

/** Production dependencies: the global fetch, Deno.env, the clock and the service-role client. */
export const defaultDeps: Deps = {
  ...platformDeps,
  // supabase-js's builder types are generic per stage; DbClient (deps.ts) is the
  // slice the handlers call, and the handler tests hold the fake to that slice.
  getClient: () => getServiceClient() as unknown as DbClient,
}
