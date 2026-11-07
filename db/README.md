# Database bootstrap (Supabase)

- `schema.sql`: complete, idempotent schema for a fresh Supabase project (tables, functions, triggers, RLS, buckets, drizzle bookkeeping). Run it in the SQL editor first.
- `import.sql`: data snapshot imported on 2026-11-07 from the AI Studio copy (trucks, stops, series, sources, logs).
- `verify.sql` + `check.mjs` + `expected-columns.json`: compare the live columns with `src/integrations/supabase/types.ts`.

Future schema changes keep going through `drizzle/migrations`.
