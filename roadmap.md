# Roadmap

## Truck profile: hybrid type, per-truck sources, Enrich priority, menu summary (2026-10-20, not published)
- [x] Hybrid truck type (fixed spot that also moves); address required only for fixed; hybrid keeps base pin when it has coordinates.
- [x] Sources tab in the truck panel: Facebook, Instagram, Google Maps profile, calendar link, website/specific page per truck; calendar links sync in the two-hour routine (events with known venues become stops, the rest wait for an address in Pending trucks).
- [x] Enrich order: truck's own sources first (never another truck's profile), then web search + shared groups as fallback; context.dev processes pages.
- [x] Menu tab: one-paragraph AI summary of what the business offers, editable, shown above the menu on the public page.
- [x] Fixed pre-existing API bug: truck IDs with underscores (bonbon-s-tacos-yp_1i) were rejected with "invalid query" on the agent endpoints.
- [x] 363 tests passed, build OK.
- [ ] Signed-in Admin verification of the Sources tab, Enrich order and AI summary: no matching session in sandbox.

## Screenshot fallback order (2026-10-20)
- [x] Implement Apify → Google Maps → context.dev fallback on errors, empty results and polling deadlines; context.dev addresses remain review drafts without verified coordinates.
- [x] Latest evidenced failure at 21:00:31 UTC: invalid Instagram directUrls caused Apify 400 and scheduled scan 500. Validate links and isolate actor failures so other social jobs/context.dev continue.
- [ ] Authenticated screenshot upload/save verification: no app account matches requesting user's email; needs Admin sign-in. Google Maps live checks require an authorized deployed origin. No screenshot-specific error was retained in available logs.

## Food-truck category review
- [x] Reviewed all 56 non-deleted food-truck records using saved Google categories and available official/public evidence; corrected 12 categories, preserved 44, and delivered full inventory with 21 evidence/identity questions. Three corrected public profiles verified without runtime errors; no status, classification, address, hours or publication changes.
- [ ] Resolve the 21 category/identity questions in the dated category report: needs readable official profiles/menus or owner confirmation; no categories guessed.

## Venue calendar sources
- [x] Admin Calendar sources with geocoded venue, sync counts and remembered title-link/ignore queue
- [x] Secure six-hour callback, 30-day RRULE/EXDATE/UNTIL/TZID/UTC expansion and atomic source-only reconciliation; 129 tests passed including live identity/update/deletion/isolation checks
- [x] Marketplace first and repeated sync: 19 stops, 3 ignored events, 8 review titles; public Schaab schedule verified, unauthenticated cron rejected, automatic build OK
- [ ] Activate managed six-hour schedule after publication approval; created but paused because published app lacks the new callback
- [ ] Signed-in Admin form/Sync now/link/ignore UI verification: no app account matches requesting user's email; needs Admin sign-in in preview

## Unified scraper approval and complete listings
- [x] Shared DB truck-status validation and transactional Admin suggestion decision synchronize pending trucks and complete, trusted future suggestions; stop-only rejection remains distinct.
- [x] New Google/social scraped listings require evidenced address/coordinates and Google category or own Facebook food evidence; incomplete discoveries stay in import errors with original post, never invent Other. Stable IDs and existing name matching deduplicate repeated detections. Admin can correct address/category.
- [x] Corrected legacy Google categories where saved evidence exists; filled 10 mobile truck addresses from saved public stops without changing type/status. No fabricated categories for remaining evidence-free listings.
- [x] 76 focused tests passed, automatic build OK; no publication.
- [ ] Authenticated Admin approval/readback and new live scraper run: no account matches requesting user's email; needs sign-in in preview. Existing records without source category evidence need profile/manual review.

## Corrected radius and visible address confirmation
- [x] Maximum coverage 100 miles; public map and regional search default 10 miles around the center pin.
- [x] Show saved address confirmation on public profile and selected fixed-truck map preview. Bonbon's matched address was already confirmed in shared data; missing profile/preview labels hid that evidence.
- [x] 61 focused tests passed; browser verified default 10-mile count, slider maximum 100 and Bonbon profile Location verified. Not published.

## Davenport 75-mile coverage and fixed-truck review (not published)
- [x] Shared 75-mile Davenport circle for map/API/social venue checks; 24 bounded city seed searches; Google/Apify gateway integration and source capture.
- [x] Matched fixed Google addresses auto-confirm through existing RPC; explicit temporary/permanent closure archives without deletion, daily closing hours do not. Merchant verification is not inferred.
- [x] Apify reviewed Bonbon's Tacos and A Guy and a Grill: both operational, matched addresses confirmed/read back; ssa and Tacos have no Google profile and remain unconfirmed. Six real Facebook pages added (Alliance, Island Vybz, Maquoketa Brewing host, Enigma, Harvest, Tri-M). No new group URL verified; existing QC group retained.
- [x] First bounded regional scrape completed (30 places, not exhaustive); genuine new candidates Dinger's D'Lites, Bad Ash BBQ Mobile Food Truck and Tri-M BBQ; unrelated stores/restaurants not imported. Pending social discoveries require approval.
- [x] 150 focused/regression tests passed including authenticated chat HTTP checks; public map 75-mile count and confirmed labels, Bonbon profile/docs verified; automatic build OK. No publication.
- [ ] Signed-in Admin Google refresh and full 24-city expansion: no matching requesting-user auth session; direct Google API sandbox validation unsupported. Publish/authorized owner validation required for new runtime behavior; current data changes already shared with live.

## Public profile schedule (not published)
- [x] Removed public import badges and post counts. Default next five upcoming/ongoing stops, list/calendar switching at any count, view all within the 30-day schedule. Untimed usual spots stay on map rather than becoming upcoming events.
- [x] 34 focused tests passed; Toni's (2 stops) and Bonbon (5 initial / 21 expanded) verified in browser; calendar/day selection works, 390px no horizontal overflow or runtime errors; Chicago times consistent, automatic build OK. Not published.

## Location confirmation (not published)
- [x] Store explicit Google verification / owner confirmation; public base and Google-hours cards show verified vs awaiting confirmation independently of opening hours.
- [x] Admin Trucks has a locations queue and drawer control; active claimed owner has a profile confirmation control. RPC enforces admin/active claimed owner permissions; direct writes cannot fake confirmation; changed address/coordinates reset evidence.
- [x] 64 focused tests passed (including signed-out RPC denial); public label verified in browser without runtime errors; automatic build OK.
- [ ] Confirm authenticated Admin/owner save/readback: requesting user has no matching app session; needs sign-in in preview. Google Place ID/regular hours do not establish merchant verification, so Admin must attest Google verification; no existing listings falsely auto-marked verified. Not published.

## Stationary trucks and Google hours (not published)
- [x] Preserve explicit truck/category classification; store raw Google categories and weekly hours snapshots. Bonbon remains true and now fixed; no fabricated hours.
- [x] Expand Chicago hours through map/app search and API/MCP; authenticated admin refresh (10 saved Places IDs, sequential) with category/hour list. Tests include overnight, 24h/DST, closed days and open_now.
- [x] Preview requested queries returned 200: open_now -> Toni's + MI Oaxaca; Bonbon -> one base result without hours. Public Bonbon map pin verified, no runtime errors; 280 tests passed, automatic build OK.
- [ ] Import real Google hours and confirm stationary candidates: sandbox forbids live Google checks; requesting user has no matching Admin session. Google hours remain unimported; run Admin > Google Maps seed > Stationary trucks > Refresh selected on the authorized site after publishing. No publication requested.

## Agent truck audit and fuzzy names (not published)
- [x] Audited all 118 records: 24 newly excluded, 44 already excluded; 30 uncertain candidates retained for Admin review. Full audit delivered in Files, records/stops preserved. Lil Stevie's has food-trailer evidence and stays.
- [x] Shared Levenshtein name matching and best-match ranking across both chat endpoints and MCP search tools; require explicit is_food_truck=true
- [x] All 266 tests passed, automatic build OK. Both preview endpoints return Toni's first for Tony's Smoking Grill; live and preview exclude Bragg (200/zero results). Data flags affect live immediately; fuzzy-name code not published. Direct OAuth MCP invocation unavailable; shared implementation verified.

## Agent API camelCase compatibility (not published)
- [x] Normalize all known camelCase aliases with the existing sanitizing rules for GET and POST on both endpoints
- [x] All 52 focused tests passed; authenticated GET/POST search returned 200 with open_now applied (2 results), and upcoming stops returned only Toni's Smokin' Grill (2 stops). Automatic build OK; URLs, auth and CORS unchanged.

## Dependency security updates (not published)
- [x] Updated @lovable.dev/mcp-js to 3.1.1; refreshed only source-map-js to 1.2.2 and js-yaml to 4.3.2 in the text lockfile, without transitive overrides or unrelated version changes
- [x] All 209 regression tests passed; automatic build OK; fresh dependency scan confirms @tailwindcss/vite and @tanstack/react-start advisories cleared
- [ ] @lovable.dev/mcp-js SDK advisory: latest 3.1.1 still pins @modelcontextprotocol/sdk to 1.28.0; requires an upstream release allowing >=1.31.0 (no forced transitive versions)
- [ ] Remaining esbuild advisory reported under @lovable.dev/mcp-js: its own esbuild is fixed at 0.27.7, but the lockfile still contains 0.18.20 pinned by @esbuild-kit/core-utils via drizzle-kit; latest drizzle-kit retains this chain, requiring an upstream fix (no forced transitive versions)

## Unsafe link-fetching fixes (not published)
- [x] Add DNS preflight for both address families on every hop, manual redirects (max 5), 8-second total deadline and streaming byte limits (calendar 3 MB; page 300 KB)
- [x] 47 focused security tests and 31 existing onboarding/calendar tests passed; real public HTML and iCal downloads passed; build OK; unrelated findings unchanged
- [x] User chose free provider restrictions instead of external pinning: calendar providers and Facebook/Instagram only, checked at entry and every redirect; custom calendars and website prefill rejected.
- [x] All 91 focused security/calendar/onboarding tests passed; build OK. Marked only the two selected findings fixed using provider restrictions, not IP pinning. Signed-in provider import flows not verified; not published.

## Automated Facebook scans
- [x] Prepare six daily scan times, every two hours 10:00–20:00 Chicago, DST-safe; retain old daily callback contract
- [x] Five timing tests passed including DST changes; callback rejects unauthenticated requests (401), build OK
- [x] Publication requested with user approval; managed schedule id 1 replaced and read back active with every-two-hours body and DST-safe UTC candidate hours (Chicago filter allows exactly six scans daily); 135 tests passed, build OK. Deployment completion and first scheduled scrape not yet verified.

## Mobile fixes and map preview
- [x] Fix profile header and quiet-hours input layout on phones
- [x] Simplify selected truck card to original post, directions, menu and profile
- [x] Verify signed-in layouts at 320/390/768/1280px, original-post URL and menu navigation; not published

## Part K — Premium profiles (not published)
- [x] Shared /profile hub, avatar crop, editable settings and account security
- [x] Foodie lists, follows, visits, preferences and progress
- [x] Owner home, real favorite summaries, business preview and existing tools
- [x] Caller-owned RLS, calculation tests and signed-in saves/crop/export verification
- [ ] New notification delivery/quiet-hours enforcement — requires HighLevel workflow support; webhook changes excluded
- [ ] Specials, reviews, device session inventory and non-favorite performance metrics — no existing data/service; explicit unavailable states

## Step 1 (current)
- [x] Lovable Cloud, roles table + has_role, first user = admin
- [x] trucks / stops / favorites / claims tables with RLS, sample trucks in DB
- [x] Sign in modal (email + Google), browsing public
- [x] Favorites: heart, /favorites with next stop + distance, favorites-only toggle

## Later (waiting for go-ahead)
- [x] Step 2: owner area, /owner/new, claim button, owner stops override imports, live updates
- Admin approval of claims (step 3)
- Admin /admin: claims, trucks edit/archive/merge, CSV import, ingestion logs
- PWA manifest, /privacy, /terms

## Step 3 — done
- [x] /admin: claims (approve/reject w/ reason), pending trucks, trucks search/edit/archive/merge, CSV import, import logs
- [x] PWA manifest + icons, /privacy, /terms, Admin link in account menu

## Step 4 — done
- [x] Public footer links to Privacy/Terms
- [x] Apify Google Maps seed (admin tab, per-city runs, gray base stops, run logs)
- [x] Step 5: Facebook scraping (sources tab, daily 6am CT)

## Step 6 — CRM (HighLevel)
- [x] New users pushed to HighLevel via inbound webhook (once per account)
- [x] Favorite-truck live alerts forwarded to HighLevel workflow
- [ ] Owner creates the two HighLevel inbound-webhook workflows and shares the URLs (waiting on user)

## Step 7 — Owner schedule
- [x] Repeating stops (weekly / every 2 weeks / monthly), skip or edit one date, month + week calendar
- [x] Public map, truck page "Upcoming stops" use scheduled stops; .ics export
- [x] Calendar link import (Apple/iCloud, Google secret iCal address), choose events to import, disconnect
- [ ] Google Calendar sign-in (OAuth) — waiting on owner's Google OAuth client

## Step 8 — Detected posts (done, not published)
- [x] suggested_stops table + RLS; trucks.reddit handle; stop_source 'own_post'
- [x] Pipeline generalized to Reddit + Instagram (apify~reddit-scraper-lite, apify~instagram-scraper)
- [x] Own-handle posts auto-approve to public calendar; community posts pending in owner inbox (Approve/Edit/Reject)
- [x] Source badges on stops (own post / community / calendar / manual)
- [ ] Verify on screen as a signed-in owner; Instagram needs public profiles (no login-only content)
## Step 9 — Truck approval flow (done, not published)
- [x] Admin Pending trucks: Approve / Reject with reason; HIGHLEVEL_APPROVAL_WEBHOOK_URL webhook (truck_approved/truck_rejected), fire-and-forget
- [ ] User fills HIGHLEVEL_APPROVAL_WEBHOOK_URL secret; verify email arrives in HighLevel

## Part I — Premium Admin
- [x] Sidebar + badges, top bar, Cmd/Ctrl+K palette, overview, truck drawer, table polish, undo, saved views, tests

## Part J — Premium Owner Onboarding (done, not published)
- [x] Welcome screen, icon stepper, completeness ring + nudges, live truck-page preview, celebrate moments, autosave indicator, save-and-finish-later
- [x] Social-link prefill (OG tags), Google address autocomplete, cuisine picker, status tracker, share kit (copy/QR/social), dashboard tour + gentle nudges
- [ ] Verify signed-in wizard flow on screen; social prefill depends on sites allowing fetches

## Smart agent search upgrade (published 2026-10-17)
- [x] Shared smart location, fuzzy food matching, Central time windows and recurring schedules for chat API + MCP; MCP manifest regenerated
- [x] Added is_food_truck and classified imported chains/restaurants; public discovery and sitemap filter it, Admin edit retains classification control
- [x] Updated docs with six real authenticated HTTP 200 responses; all 247 regression tests passed and automatic build OK; missing/incorrect key returns 401
- [ ] Signed-in Admin classification save and OAuth MCP invocation unverified: requesting user's account unavailable for session minting; code/manifest verified, no publication requested
- [x] Voice agent tolerant params, POST/Bearer, Admin API log: done; publication requested 2026-10-17 for app.foodtruckqc.com

## Admin editing, stop log, stats, context.dev (2026-10-20, not published)
- [x] Mobile trucks approvable without address; fixed trucks require address
- [x] Truck panel: edit details, menu, photos, stops; add stops from screenshot (AI draft)
- [x] Stops log with date/truck/status/source filters + CSV
- [x] Usage stats + direction clicks per location (from today)
- [x] context.dev website/directory sources in the two-hour scan
- [x] context.dev key saved

## Admin stops: Google search, Enrich, address alerts (not published)
- [x] Screenshot upload automatically enriches venue addresses with Maps, Gemini web research, context.dev and Apify; uncertain matches stay drafts and verified coordinates are retained on save. Gemini live research + 19 focused tests passed; build OK.
- [ ] Screenshot upload/save signed-in verification and live Maps validation: requesting user has no matching app account; Maps testing is unavailable in sandbox. User must test on authorized origin; not published.
- [x] Google Maps place/address search in the stop form; Enrich button (sources, context.dev websites + custom link, per-truck Facebook/Instagram scan, venue calendars); Pending trucks lists trucks with stops missing an address, opening the Stops tab.
- [ ] Signed-in Admin verification of these three flows.

## Sources tab + Enrich review (2026-10-20, not published)
- [x] Fixed social_sources kind CHECK rejecting calendar/gmaps sources (applied to live DB)
- [x] Enrich Google Maps step now ignores hits whose name does not match the truck
- [x] Web research timeout raised 20s -> 45s (was aborting)
- [x] Browser-tested as admin: add calendar/gmaps sources, Enrich priority (own sources first, groups fallback)

## Enrich multi-link + progress bar (2026-10-20, not published)
- [x] Enrich accepts up to 5 custom links (or none); links become truck sources
- [x] Enrich runs in background (enrich_runs table, migration 0039); dialog+drawer close and a bottom progress bar polls the step log; clicking it expands found/not-found per source
- [x] Primary-source-first priority kept, shared groups as fallback; browser-tested as admin (Rural Rumps, 6 steps)
