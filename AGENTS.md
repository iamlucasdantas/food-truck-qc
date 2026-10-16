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
- Truck/stop data lives in Lovable Cloud tables; pure status/time rules live in `src/data/trucks.ts` (unit-tested) so UI and tests share them.
- Stops are concrete dated rows (not weekly patterns) so owner edits, cancellations and live check-ins are single-row changes.
- Auth is a modal opened via `useAuth().openAuth()`; pages stay public and RLS protects data — no route-level gate.
- Roles only come from `user_roles` + `has_role()`; never from profile/user metadata.
- Truck logos are stored as small data URLs on the truck row because the workspace blocks public storage buckets.
- Social ingestion (Facebook pages/groups, Reddit, Instagram): one async Apify job per kind per run; an Apify webhook + admin Continue process posts in time-boxed batches, deduped via social_posts, so work survives reloads and timeouts. Stops from the truck's own handle (authorIsTruck vs trucks.facebook/instagram/reddit) auto-approve as source own_post; anyone else's post becomes a pending suggested_stops row the owner approves/edits/rejects — nothing public until approved.
- Guest hearts live in localStorage and merge into favorites on sign-in (FavoritesSync); signed-in-only pages go under src/routes/_authenticated (client-side gate), so public pages stay crawlable.
- Sitemap is router-derived (src/lib/sitemap.ts + sitemap[.]xml route); every route must set staticData.sitemap, and truck pages come from active trucks — keeps Google's page list in sync automatically.
- Only auth emails come from Lovable Cloud; every other email is sent by the owner's HighLevel CRM. App code only POSTs flat snake_case JSON to one inbound-webhook URL per flow (HIGHLEVEL_USER_WEBHOOK_URL, HIGHLEVEL_OWNER_WEBHOOK_URL, HIGHLEVEL_ALERT_WEBHOOK_URL secrets) and fails quietly when unset.
- Repeating stops are stored as rules in stop_series and expanded on read (src/data/schedule.ts, unit-tested) — no pre-generated rows; editing one date adds it to skip_dates plus a concrete stops row.
- Calendar connections are read-only iCal feed links in calendar_feeds (owner-only RLS); events become public only when the owner imports them.
- Business-level data (name, description, website, socials, logo, payment methods) lives in one businesses row per owner; trucks keep truck-specific data, and legacy truck website/social columns are only fallbacks for unclaimed imports — so one owner's trucks share handles for own-post matching.
- Truck photos live in the private truck-photos bucket under <truck_id>/ with an anyone-can-read storage policy, shown via signed URLs (public buckets are blocked by the workspace); rows in truck_photos hold order/cover. AI-read menus are only drafts until the owner publishes them into trucks.menu_sections (+ menu_search for dish search).
