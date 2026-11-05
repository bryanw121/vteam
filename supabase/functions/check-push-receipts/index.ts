// Edge Function: check-push-receipts. The handler and its documentation are in handler.ts.
import { createHandler } from './handler.ts'
import { defaultDeps } from '../_shared/supabase.ts'

Deno.serve(createHandler(defaultDeps))
