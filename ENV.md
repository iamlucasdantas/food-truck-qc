# Environment variables

The app no longer depends on any Lovable-hosted service. Every secret is a plain environment
variable, set in the Vercel project (Settings → Environment Variables) for Production and Preview.
`VITE_*` values are inlined into the browser bundle at build time, so they must never be secret.

| Variable | Required | What it is for |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL (`https://<ref>.supabase.co`), used by server code. |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable (anon) key, used by server code with the caller's session (RLS applies). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service-role key for admin/cron code (`supabaseAdmin`). Server only. Also the default HMAC key for screenshot-lookup signatures. |
| `VITE_SUPABASE_URL` | yes | Same URL as above, for the browser bundle. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Same publishable key, for the browser bundle. |
| `VITE_SUPABASE_PROJECT_ID` | yes | Supabase project ref; the MCP OAuth issuer is derived from it. |
| `GOOGLE_API_KEY` | yes | Google AI (Gemini) key: menu/post/schedule screenshot readers, Facebook post extraction, web research. |
| `GOOGLE_MAPS_API_KEY` | yes | Google Maps Platform server key (Places API New + Geocoding API; application restriction None or IP). |
| `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` | no | Not read by the code any more (the old Lovable connector injected it). Safe to omit. |
| `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID` | no | Not read by the code. Safe to omit. |
| `VITE_GOOGLE_ANALYTICS_MEASUREMENT_ID` | no | GA4 measurement id (`G-…`) for page analytics. |
| `APIFY_API_KEY` | yes | Apify token: Google Maps discovery, Facebook/Instagram/Reddit scans, venue lookups. |
| `CONTEXT_DEV_API_KEY` | no | context.dev key for reading websites/directories; features degrade gracefully without it. |
| `CRON_SECRET` | yes | Bearer token Vercel Cron sends to `/api/public/jobs/*` (set it in Vercel; Vercel attaches it automatically). `LOVABLE_CRON_SECRET` is still accepted as a fallback. |
| `CHAT_AGENT_API_KEY` | no | Key for the public chat endpoints (`/api/public/chat/*`) used by the HighLevel voice/chat agent. |
| `FACEBOOK_COOKIES_JSON` | no | Logged-in Facebook session cookies (JSON array) for private groups. |
| `HIGHLEVEL_USER_WEBHOOK_URL` | no | HighLevel inbound webhook for new user sign-ups. |
| `HIGHLEVEL_OWNER_WEBHOOK_URL` | no | HighLevel inbound webhook for new truck owners. |
| `HIGHLEVEL_APPROVAL_WEBHOOK_URL` | no | HighLevel inbound webhook when a truck is approved. |
| `HIGHLEVEL_ALERT_WEBHOOK_URL` | no | HighLevel inbound webhook for admin alerts. |
| `LOOKUP_SIGNING_SECRET` | no | Optional dedicated HMAC secret for screenshot-lookup run ids (defaults to the service-role key). |
| `AGENT_API_TEST_ORIGIN` | no | Test-only origin override for the agent API tests. |

## Supabase dashboard settings (not env vars)

- Authentication → URL configuration: Site URL `https://app.foodtruckqc.com`, redirect URLs
  `https://app.foodtruckqc.com/**` and the Vercel preview domain.
- Authentication → Providers → Google: enable with a Google OAuth client (web) whose authorized
  redirect URI is `https://<ref>.supabase.co/auth/v1/callback`. Email/password works without it.
- Authentication → Email: the built-in Supabase templates are used (the Lovable email webhook was removed).

## Vercel cron

`vercel.json` schedules `/api/public/jobs/facebook-daily?kind=daily|every-two-hours|continue` and
`/api/public/jobs/venue-calendars`. Times are UTC; the handlers themselves gate on America/Chicago,
so the `daily` job runs at both 11:00 and 12:00 UTC and only the one that is 06:00 Chicago does work.
