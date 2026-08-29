-- Row-level security, as defence in depth.
--
-- architecture.md §4: "Postgres RLS is enabled on all tables as defence in
-- depth, but the application does not rely on RLS for business-level
-- authorisation, because permission logic (e.g. 'approve is only available once
-- inspection is recorded') is richer than row filters."
--
-- So: enabled everywhere, with no policies. No policies means no rows for the
-- `anon` and `authenticated` roles — deny by default. The service-role key used
-- by lib/supabase/data.ts bypasses RLS, which is why the application still
-- works and why that key is server-only and never prefixed NEXT_PUBLIC_.
--
-- What this buys today is narrow and real: if the publishable key ever reaches
-- a browser with a data query attached — the failure architecture.md §2 forbids
-- by convention — it returns nothing rather than the booking table.
--
-- Policies proper arrive with the auth slice, which is what creates the
-- sessions they would be written against. Adding speculative ones now would
-- mean writing filters for a session shape that does not exist yet.

alter table property enable row level security;
alter table unit_type enable row level security;
alter table unit enable row level security;
alter table guest enable row level security;
alter table booking enable row level security;
alter table booking_line enable row level security;
alter table occupancy enable row level security;
alter table audit_event enable row level security;
alter table staff_role enable row level security;
alter table role_permission enable row level security;
alter table user_role enable row level security;
