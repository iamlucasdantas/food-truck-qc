# Roadmap

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
