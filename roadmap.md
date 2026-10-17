# Roadmap

## Agent truck audit and fuzzy names (not published)
- [ ] Audit every listing; exclude clear non-trucks and report excluded/uncertain records for Admin review
- [ ] Share fuzzy-name matching and best-match ranking across both chat endpoints and MCP; require explicit is_food_truck=true
- [ ] Run focused tests and authenticated API checks, report results and remaining uncertainty

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
