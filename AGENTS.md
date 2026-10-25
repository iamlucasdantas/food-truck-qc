<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules
- Address-only manual geocoding uses geocode.server.ts (Google server connector then identified Nominatim fallback); UI uses authenticated geocode.functions.ts and MCP calls the helper after admin authorization. The UI wrapper returns null on lookup failure and Admin draft creation retains unresolved addresses without coordinates; the strict server/MCP helper still throws and logs provider diagnostics, so optional lookups cannot strand saves or invent public pins.
- Managed social scans use the stable facebook-daily callback with a validated versioned body and Chicago-local timing rules in src/data/social-schedule.ts; preserve the old body until deployment and schedule replacement so live callbacks remain compatible.
- Read src/lib/AGENTS.md and src/data/AGENTS.md before edits there; subdirectories may have their own AGENTS.md.
- Shared agent search ranks names/classification; public-schedule handles profiles. data/coverage.ts defines Davenport coverage for map/API/ingestion to agree.
- Truck/stop data lives in Lovable Cloud; UI and tests share pure status/time rules in `src/data/trucks.ts`.
- Public map/list use the shared base-stop predicate and strict open-only live filtering even for empty results; static home markers appear only on offline opt-in, and the map clock refreshes at stop boundaries to avoid stale online presence.
- Public radius uses useMapRadius for immediate local drag updates and commit-only URL persistence; map/list consume the same value so router navigation cannot interrupt slider movement.
- Public discovery filters is_food_truck; Admin keeps classification edits for review.
- Auth is a modal opened via `useAuth().openAuth()`; pages stay public and RLS protects data — no route-level gate.
- Roles only come from `user_roles` + `has_role()`; never from profile/user metadata.
- Truck logos are stored as small data URLs on the truck row because the workspace blocks public storage buckets.
- Guest hearts live in localStorage and merge into favorites on sign-in (FavoritesSync); signed-in-only pages go under src/routes/_authenticated (client-side gate), so public pages stay crawlable.
- MCP: src/lib/mcp, managed OAuth at /mcp plus API-key MCP at /api/public/mcp-key (key owner gets a minted real session so RLS/has_role apply identically); never edit generated routes. Admin tools (business → trucks → stops CRUD) check has_role via mcp/admin.ts and still write as the caller so RLS and DB approval triggers apply.
- Sitemap is router-derived (src/lib/sitemap.ts + sitemap[.]xml route); every route must set staticData.sitemap, and truck pages come from active trucks — keeps Google's page list in sync automatically.
- Only auth emails come from Lovable Cloud; every other email is sent by the owner's HighLevel CRM. App code only POSTs flat snake_case JSON to one inbound-webhook URL per flow (HIGHLEVEL_USER_WEBHOOK_URL, HIGHLEVEL_OWNER_WEBHOOK_URL, HIGHLEVEL_ALERT_WEBHOOK_URL secrets) and fails quietly when unset.
- Owner recurrence uses stop_series expanded on read; one-date edits use skip_dates + stops. Venue calendars use ICAL.js and atomic source/UID/date reconciliation of calendar-owned stops; admin title links never create trucks.
- Calendar connections are read-only iCal feed links in calendar_feeds (owner-only RLS); events become public only when the owner imports them.
- Business-level data (name, description, website, socials, logo, payment methods) lives in one businesses row per owner; trucks keep truck-specific data, and legacy truck website/social columns are only fallbacks for unclaimed imports — so one owner's trucks share handles for own-post matching.
- Truck photos live in the private truck-photos bucket under <truck_id>/ readable only by the truck's owner/admin; the public gallery gets signed URLs from signTruckPhotos (server, only paths listed in truck_photos) because public buckets are blocked and blanket read policies leak files; rows in truck_photos hold order/cover. AI-read menus are only drafts until the owner publishes them into trucks.menu_sections (+ menu_search for dish search).
- Ask business info once: src/data/business.ts governs signup/linking; embed email lookup is server-only and returns known/unknown, never account data.
- trucks.business_name is set by DB triggers from the owner's businesses row (falls back to the 'Business:' line for unowned submissions) and re-synced when the business is renamed — so every add path, display byline and webhook gets it without asking again.
- Owner onboarding saves profiles.onboarding; pure step/resume/completeness rules live in src/data/onboarding.ts and UI in src/components/onboarding. Social prefill and Places autocomplete are authenticated server functions; owns_truck() covers creators' pending trucks so setup works before approval.
- /profile is a role-aware shared shell; private settings/library use caller-owned RLS tables, shared profiles expose opt-in safe fields by RPC, and rules live in src/data/profile.ts so UI and tests agree.
- Website-form trucks link to an account only via linkMyEmbedTrucks after the account email is confirmed; a typed email never links anything.
- Admin deletes via audited admin_delete_trucks/admin_restore_truck RPCs; 30-day restore window, then daily purge of truck/stops/photos/menu.
- Admin uses components/admin and data/admin.ts. Shared scraper approval uses a DB status trigger and admin_review_suggested_stop; data/ingestion-review.ts validates source categories and locations. Google profile rules separate address, closure and hours.
- Approval requires an address only for fixed-location trucks (DB trigger + approvalIssue in data/ingestion-review.ts); mobile trucks go live only through dated stops with coordinates.
- Admin usage stats come from first-party app_events (anon insert, admin read; src/lib/track.ts); pure summaries in data/usage.ts.
- context.dev website scans use ingestPost in the two-hour facebook-daily job without blocking Apify.
- Screenshot enrichment uses bounded sequential fallbacks; signed polls bind lookup inputs, failures continue, and page addresses stay drafts without verified pins.
