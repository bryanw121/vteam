// Edge Function: places-proxy. The handler and its documentation are in handler.ts.
// It never touches the database, so it gets the runtime deps without supabase-js.
import { createHandler } from './handler.ts'
import { platformDeps } from '../_shared/platform.ts'

Deno.serve(createHandler(platformDeps))
