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
- Subdirectories have their own AGENTS.md (src/lib); read it before changing files there.
- Truck/stop data lives in Lovable Cloud tables; pure status/time rules live in `src/data/trucks.ts` (unit-tested) so UI and tests share them.
- Stops are concrete dated rows (not weekly patterns) so owner edits, cancellations and live check-ins are single-row changes.
- Auth is a modal opened via `useAuth().openAuth()`; pages stay public and RLS protects data — no route-level gate.
- Roles only come from `user_roles` + `has_role()`; never from profile/user metadata.
- Truck logos are stored as small data URLs on the truck row because the workspace blocks public storage buckets.
- Guest hearts live in localStorage and merge into favorites on sign-in (FavoritesSync); signed-in-only pages go under src/routes/_authenticated (client-side gate), so public pages stay crawlable.
- Sitemap is router-derived (src/lib/sitemap.ts + sitemap[.]xml route); every route must set staticData.sitemap, and truck pages come from active trucks — keeps Google's page list in sync automatically.
- Only auth emails come from Lovable Cloud; every other email is sent by the owner's HighLevel CRM. App code only POSTs flat snake_case JSON to one inbound-webhook URL per flow (HIGHLEVEL_USER_WEBHOOK_URL, HIGHLEVEL_OWNER_WEBHOOK_URL, HIGHLEVEL_ALERT_WEBHOOK_URL secrets) and fails quietly when unset.
- Repeating stops are stored as rules in stop_series and expanded on read (src/data/schedule.ts, unit-tested) — no pre-generated rows; editing one date adds it to skip_dates plus a concrete stops row.
- Calendar connections are read-only iCal feed links in calendar_feeds (owner-only RLS); events become public only when the owner imports them.
- Business-level data (name, description, website, socials, logo, payment methods) lives in one businesses row per owner; trucks keep truck-specific data, and legacy truck website/social columns are only fallbacks for unclaimed imports — so one owner's trucks share handles for own-post matching.
- Truck photos live in the private truck-photos bucket under <truck_id>/ readable only by the truck's owner/admin; the public gallery gets signed URLs from signTruckPhotos (server, only paths listed in truck_photos) because public buckets are blocked and blanket read policies leak files; rows in truck_photos hold order/cover. AI-read menus are only drafts until the owner publishes them into trucks.menu_sections (+ menu_search for dish search).
- Business info is asked once per owner: signup steps and the "link to existing business" rules live in src/data/business.ts (unit-tested); the embed form matches an email server-side (owner_id_by_email, service-role only) and only tells the browser known/unknown — so repeat trucks share contact + business_name without leaking account data.
- trucks.business_name is set by DB triggers from the owner's businesses row (falls back to the 'Business:' line for unowned submissions) and re-synced when the business is renamed — so every add path, display byline and webhook gets it without asking again.
- Owner onboarding (/owner/onboarding) saves progress in profiles.onboarding; step/skip/resume rules live in src/data/onboarding.ts (unit-tested). owns_truck() also covers the creator's own pending, unclaimed truck so menu/photos/schedule can be set up before approval.
- Website-form trucks link to an account only via linkMyEmbedTrucks after the account email is confirmed; a typed email never links anything.
- Admin truck delete is a soft delete (deleted_at/deleted_by via admin_delete_trucks/admin_restore_truck RPCs, logged in truck_deletions) with a 30-day restore window; a daily pg_cron job purges the truck and its stops/photos/menu after that — so mistakes are reversible.
- Search/filter rules (text, dish, cuisine, city, type, status, open) live in src/data/filters.ts and are shared by the map and Admin; filter state lives in URL params so views can be shared.
- "I'm here" end times come from liveEnd() in src/data/trucks.ts (15 min–12 h, Central time); the DB trigger caps live stops at 12 h.
