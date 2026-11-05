/**
 * The runtime's own dependencies (network, env, clock) with no supabase-js,
 * for functions that never touch the database (places-proxy): importing
 * `_shared/supabase.ts` would load supabase-js into them for nothing.
 * `defaultDeps` in `_shared/supabase.ts` adds the service-role client.
 */

import type { Deps } from './deps.ts'

export const platformDeps: Omit<Deps, 'getClient'> = {
  fetch: (input, init) => fetch(input, init),
  env: (name) => Deno.env.get(name),
  now: () => Date.now(),
}
