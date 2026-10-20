# Admin: approval rules, full truck editing, stop history, stats, context.dev

## 1. Approval rules
- Admin can approve trucks without an address.
- Fixed-location trucks must always have an address (approval blocked otherwise).
- Mobile trucks can be approved with no address; they only appear live on the map when they have a stop with an address and a specific time.
- Category rule (Google/Facebook evidence, never "Other") stays as is.

## 2. Full editing in the truck detail panel
- Overview: edit every field inline (name, category, type, address, contacts, socials, description, payments, logo).
- Menu: add/edit/remove sections and items, prices; upload a menu photo for AI draft (reuse existing reader).
- Photos: upload, delete, reorder, set cover (Admin can manage any truck's photos).
- Stops: add, edit, cancel, delete dated stops and weekly repeating rules.
- Stops from screenshot: upload a print; AI reads venue, address, dates and times, shows an editable draft, Admin confirms before saving (private events and past dates skipped).

## 3. Stop log
- New Admin section "Stops log": every stop ever made by any truck, filter by date range, truck, venue/city, source and status (past, live, upcoming, cancelled). CSV export.

## 4. Statistics
- Usage stats in Admin Overview: visitors, page views, top truck pages, searches, favorites, API/agent calls, over chosen period.
- Per-location stats: how many people viewed/clicked directions for each venue/stop (tracked from now on; no history before this).

## 5. context.dev source
- Connect context.dev with its API key (you will be asked for it).
- New source type: business websites and food-truck directory sites; extracts name, category, address, schedule, menu and goes through the same review/duplicate rules.
- Runs in the existing every-2-hours scan (10:00–20:00 Chicago) together with Facebook/Apify.

## Technical notes
- Migration: relax approval trigger (address required only when truck_type = 'fixed'); public map/live queries already require stop coordinates.
- Admin storage policies for truck-photos via has_role('admin').
- New events table (page_view, direction_click, stop_view) with anon insert, admin-only read.
- Screenshot reader reuses post-reader with a stops-specific prompt via Lovable AI.
- context.dev called server-side from the facebook-daily job body (versioned, old body kept compatible).
- Tests: approval rule (fixed vs mobile), stop-log date filter, screenshot draft parsing.
