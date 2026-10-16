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
