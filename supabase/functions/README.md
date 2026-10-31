# Edge functions

| Function | Caller | Auth | `verify_jwt` |
| --- | --- | --- | --- |
| `send-chat-push` | Database Webhook on `messages` INSERT | service-role bearer or `x-webhook-secret` | `false` |
| `send-notification-push` | Database Webhook on `notifications` INSERT | service-role bearer or `x-webhook-secret` | `false` |
| `check-push-receipts` | pg_cron every 30 min (migration `20261024120500_push_receipts.sql`) | service-role bearer or `x-webhook-secret` | `false` |
| `places-proxy` | the app, via `supabase.functions.invoke('places-proxy')` | user JWT checked by the gateway | `true` |
| `send-feedback-email` | the app, after inserting `feedback_submissions` (`lib/feedback.ts`) | user JWT checked by the gateway; the function emails only a fresh row the caller owns | `true` |
| `generate-badge-art` | an admin, via `scripts/generate-badge-art.mjs` | user JWT checked by the gateway; the function checks the caller is an admin | `true` |

`verify_jwt` is declared in [`../config.toml`](../config.toml) and applied on deploy.
Shared code lives in `_shared/` (`supabase.ts`: service-role client, Expo constants;
`webhook.ts`: request authentication). Imports of local files need the `.ts` extension.

## Webhook authentication

`send-chat-push`, `send-notification-push` and `check-push-receipts` run with `verify_jwt = false`, so they
check the request themselves with `requireWebhookAuth` (`_shared/webhook.ts`).
A request is accepted when **either**

- `Authorization: Bearer <token>` equals the function's `SUPABASE_SERVICE_ROLE_KEY`
  (Supabase injects this secret into every function; nothing to set), **or**
- `x-webhook-secret: <secret>` equals the `WEBHOOK_SECRET` function secret.

Anything else gets `401`. Comparison is constant-time. The bearer must be the exact
service-role key the function sees at runtime.

`WEBHOOK_SECRET` is new and **optional**. The existing service-role bearer keeps
working, so nothing has to change for pushes to keep flowing. Set one if you would
rather not put the service-role key in a Dashboard webhook header:

```bash
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

then in Dashboard → Database → Webhooks → the `messages` INSERT webhook, replace the
`Authorization` header with `x-webhook-secret: <the same value>`.

pg_cron keeps using the service-role bearer from Vault (`service_role_key`).

### Limits

`send-chat-push` skips a message id it handled in the last 10 minutes, to absorb
webhook retries. The memory is per function instance and is lost on cold start, so
it is best effort only; a durable guarantee would need a column on `messages`.

## `send-notification-push`

Pushes every `notifications` row (event reminders, cancellations, waitlist,
cheers, join requests, late dropouts, and any type added later) to the
recipient's devices, unless they turned push off for that type
(`profiles.notification_prefs.push.<type> = false`). The push carries the row's
`data.deep_link`, which the app opens on tap. `chat_mention` rows are skipped:
`send-chat-push` already pushed the message. Same chunking, dead-token cleanup
and `push_receipts` bookkeeping as `send-chat-push`, and the same best-effort,
per-instance dedupe of webhook retries (keyed on the notification id).

**Manual setup per project (not captured by migrations):**

1. `supabase functions deploy send-notification-push` (applies `verify_jwt = false`).
2. Dashboard → Database → Webhooks → Create: table `notifications`, event
   `INSERT`, type "Supabase Edge Functions", function `send-notification-push`,
   method POST, header `x-webhook-secret: <WEBHOOK_SECRET>` (set the secret first,
   see above) or `Authorization: Bearer <service-role key>`.
3. Check: a new inbox row shows up in the function's logs within seconds; a
   `401` there means the header doesn't match.

Event reminders themselves are written by the `event-reminders` pg_cron job
(`public.send_event_reminders()`, migration `20261101090000_event_reminders.sql`).
It runs on beta as well, but beta has no edge functions or webhook, so nothing
is pushed there.

## `places-proxy`

Needs the `GOOGLE_MAPS_KEY` secret. `ALLOWED_ORIGINS` is optional: a comma-separated
list of browser origins allowed by CORS (for example
`https://app.example.com,http://localhost:8081`). Unset means `*`. Native apps send no
`Origin` header and are unaffected.

## `send-feedback-email`

Emails a stored feedback / bug submission to the team (#9). The app saves the row
first, then calls the function with only `{ id }`; the function loads the row with the
service role, checks the caller owns it, that it is under 15 minutes old and that the
caller has made at most 5 submissions in the last hour, and sends it through Resend.
Without `RESEND_API_KEY` it answers `503 email not configured` and the submission is
still saved; the app shows success either way.

| Secret | Required | Default |
| --- | --- | --- |
| `RESEND_API_KEY` | yes, to send | none (503 until set) |
| `FEEDBACK_EMAIL` | no | `DEFAULT_FEEDBACK_EMAIL` in `_shared/feedback.ts`, pinned by a unit test to `FEEDBACK_EMAIL` in `constants/feedback.ts` |
| `FEEDBACK_FROM` | no | `vteam <feedback@vteamvolleyball.com>` |
| `ALLOWED_ORIGINS` | no | `*` (same as places-proxy) |

The destination lives in `constants/feedback.ts`. To change it, edit that constant and
the function default (the test fails until both match) and redeploy, or set the
`FEEDBACK_EMAIL` secret, which takes effect without a release.

Resend setup: create an API key (Sending access), add the sending domain
(`vteamvolleyball.com`) under Domains, add the DNS records Resend shows (an MX and a TXT
SPF record on the `send` subdomain, and the DKIM TXT record `resend._domainkey`; a DMARC
TXT on `_dmarc` is recommended), wait for "Verified", then:

```bash
supabase secrets set RESEND_API_KEY=re_xxx
# optional
supabase secrets set FEEDBACK_EMAIL=bryan.wu.121@gmail.com FEEDBACK_FROM="vteam <feedback@vteamvolleyball.com>"
```

Until the domain is verified, Resend only accepts `onboarding@resend.dev` as the sender
and only delivers to the Resend account's own address, so `FEEDBACK_FROM="vteam <onboarding@resend.dev>"`
works for a first test if that account uses the destination address.

## Deploying

From the repo root, logged in with `supabase login` and linked with
`supabase link --project-ref <ref>`:

```bash
supabase functions deploy send-chat-push
supabase functions deploy send-notification-push
supabase functions deploy check-push-receipts
supabase functions deploy places-proxy
supabase functions deploy send-feedback-email
# or all at once:
supabase functions deploy
```

Deploy applies `verify_jwt` from `config.toml`. After the first deploy from this
config, check Dashboard → Edge Functions that the three push functions show JWT
verification off and `places-proxy` on.

Quick check of a deployed push function (expect `401`, then not `401`):

```bash
curl -i -X POST "https://<ref>.supabase.co/functions/v1/check-push-receipts"
curl -i -X POST "https://<ref>.supabase.co/functions/v1/check-push-receipts" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

## `generate-badge-art`

Generates the art for one badge tier (#10) with OpenAI's Images API, stores the PNG
in the public `badges` bucket under `generated/<badge>/tier<n>-<ms>.png` (a new file
each time, cached for a year) and upserts its URL into `public.badge_art`. The app
reads that table (`hooks/useBadgeArt`) and falls back to the built-in art; nothing
generates on the render path.

- **Admins only.** The function resolves the caller from the JWT and checks
  `app_admins` (after #102) or else `profiles.is_admin`, with the service role.
- **Consistent set.** The prompt is built from the tier spec and the style tokens in
  `_shared/badgeArt.ts` (the only place the look is defined), so the same spec always
  gives the same prompt. Change the look there and regenerate.
- **Secrets.** `OPENAI_API_KEY` (required; without it: `503 not configured`).
  Optional `OPENAI_IMAGE_MODEL` (default `gpt-image-1.5`) and `OPENAI_IMAGE_QUALITY`
  (`low` | `medium` | `high`, default `medium`).
- **Trigger.** `node scripts/generate-badge-art.mjs serve_cheer 2` (one tier),
  `... serve_cheer` (every tier of a badge), `... --missing` (every tier without art),
  plus `--dry-run` to print prompts without generating. It reads the project URL and
  anon key from `.env` and signs in with `BADGE_ADMIN_EMAIL` / `BADGE_ADMIN_PASSWORD`
  (or `BADGE_ADMIN_TOKEN`).
- **Cost.** One 1024x1024 image per call: about $0.03 at `medium` quality on
  `gpt-image-1.5` ($0.01 `low`, $0.13 `high`). The full catalog today is 36 tiers (about $1.20 at medium).
- **Undo a tier.** Delete its `badge_art` row (SQL editor); the app falls back to the
  built-in art. Old PNGs stay in the bucket.
