-- Booking references grow past 9999 instead of colliding.
--
-- 20260829000500 formats a reference as `lpad(nextval(...)::text, 4, '0')`, and
-- its own comment promises that "past 9999 the reference grows to five digits".
-- It does not. `lpad` pads a short string and **truncates a long one**:
--
--     lpad('9999',  4, '0') = '9999'
--     lpad('10000', 4, '0') = '1000'      <- cut, not grown
--     lpad('10009', 4, '0') = '1000'      <- the same reference again
--
-- Ten consecutive sequence values therefore collapse onto one reference. The
-- `unique (property_id, reference)` constraint refuses nine of every ten, so
-- from the 10,000th booking onward nine out of ten attempts fail with a
-- duplicate-key error. The constraint is doing exactly the right thing — the
-- alternative is ten guests quoting one reference on ten bank transfers, and a
-- reference that identifies one booking forever is the whole point of §6.1 —
-- but booking creation is 90% broken at that point.
--
-- ── Two horizons, and the near one is why this is worth fixing now ─────────
--
-- Production is ~10,000 bookings away, which at this property's volume is
-- years, and that is what the original note was weighing. A **local** database
-- crosses it in about thirty full test runs: the suite burns roughly 155
-- references each time, and nothing ever winds the sequence back. There the
-- symptom is not a clear error but scattered failures in tests that have
-- nothing to do with references — a booking that cannot be created, blamed on
-- whatever assertion happened to be next.
--
-- ── Why the formatting is now its own function ────────────────────────────
--
-- Because that is why nobody caught it. The rule was welded to `nextval()`, so
-- checking it meant burning sequence values and manipulating a sequence from a
-- test — which the integration harness has no way to do, since it speaks to the
-- database through PostgREST rather than raw SQL. Split out, the rule is an
-- immutable function of one number, callable from a test, and the boundary is
-- pinned by lib/db/bookings.test.ts.
--
-- `create or replace` for `next_booking_reference()`: its signature is
-- unchanged, so there is no overload for PostgREST to resolve ambiguously.
-- 20260830000100's drop-first note applies to functions that gain a parameter.
--
-- The sequence itself is deliberately untouched. Where it currently stands is
-- per-database state, not schema, and a migration that reset it would renumber
-- references differently on every environment it ran in.

create function booking_reference_for(p_value bigint) returns text
language sql
immutable
as $function$
  select 'PV-' || case
    -- Four digits is the shape staff read off a bank transfer and quote at the
    -- gate, so it stays the shape for as long as it can hold one.
    when p_value <= 9999 then lpad(p_value::text, 4, '0')
    -- Past that the reference is simply longer. Never truncated: architecture.md
    -- §6.1 makes a reference identify exactly one booking, forever.
    else p_value::text
  end;
$function$;

comment on function booking_reference_for(bigint) is
  'Formats a booking reference from a counter value. Pads to four digits and grows beyond, never truncating — see 20260903000100 for the lpad bug this replaced.';

create or replace function next_booking_reference() returns text
language sql
volatile
as $function$
  select booking_reference_for(nextval('booking_reference_seq'));
$function$;

revoke execute on function booking_reference_for(bigint) from public, anon, authenticated;

grant execute on function booking_reference_for(bigint) to service_role;
