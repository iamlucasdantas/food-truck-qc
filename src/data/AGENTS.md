# src/data rules
- Search/filter rules (text, dish, cuisine, city, type, status, open) live in src/data/filters.ts and are shared by the map and Admin; filter state lives in URL params so views can be shared.
- "I'm here" end times come from liveEnd() in src/data/trucks.ts (15 min–12 h, Central time); the DB trigger caps live stops at 12 h.
- Duplicate rules (same Google place/link/phone/name = strong, similar name = possible) live in src/data/duplicates.ts and are shared by Admin "Add truck" (server re-checks before insert) and the Possible duplicates view.
