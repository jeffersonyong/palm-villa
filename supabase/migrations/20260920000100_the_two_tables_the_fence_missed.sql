-- The two tables row-level security never reached.
--
-- 20260829000800 enabled RLS on every table then in existence and explained
-- why: enabled everywhere, no policies, so `anon` and `authenticated` see no
-- rows at all and the service-role client the server uses bypasses it. Every
-- migration since has carried the same line for the tables it added —
-- `deposit`, `document`, `cash_banking`, the three day-pass settings tables —
-- except one. 20260913000100 created `day_pass` and `public_attempt`, wrote
-- their grants, and never enabled RLS on either.
--
-- Nothing is exposed today. That migration's grant block does
-- `revoke all ... from public, anon, authenticated` on both, and a revoke is a
-- real control. But it is a *different* control from the one architecture.md
-- §4 describes, and it is the weaker of the two to be left holding the line
-- alone: a revoke is undone by any later `grant`, and Postgres restores
-- default privileges to `public` for objects created afterwards by the same
-- pattern. RLS with no policies denies rows even when a grant says otherwise.
-- Two lines is a small price for the fence being continuous.
--
-- What sits behind them is worth the consistency. `public_attempt` is the
-- rate-limit counter the whole public flow depends on — its rows are hashes of
-- addresses and phone numbers — and `day_pass` holds the party snapshot for
-- every day-pass booking.
--
-- No policies, deliberately, for the reason 20260829000800 gives: business
-- authorisation is `requirePermission()` in the server layer, and a row filter
-- cannot express it.

alter table day_pass enable row level security;
alter table public_attempt enable row level security;
