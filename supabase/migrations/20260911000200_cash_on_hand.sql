-- Cash on hand: what the safe should be holding (capability E4, prd.md §10.5).
--
-- The first cut of the cash-up reconciled each business day on its own —
-- recorded against banked, with a variance per row. That reads correctly only
-- for a desk that banks every day it takes cash, and Palm Villa does not: an
-- evening's notes are walked to the bank the next morning, and a quiet week is
-- banked in one trip. Under a per-day rule that trip left four days reading
-- "Not banked" and one reading "Over" by four days' takings, and squaring it
-- would have meant splitting one deposit slip across five rows by hand.
--
-- So the reconciliation is a running balance instead: cash taken, less cash
-- banked, carried forward. One lump sum clears whatever has built up, whichever
-- days it came from, and the figure the screen leads with — what should be in
-- the safe right now — is the one a person can actually check by counting it.
--
-- That needs an opening balance, because a window that starts on the 1st does
-- not start from zero. This is that figure, and it is deliberately a database
-- aggregate rather than a read of every historical row into the application:
-- the number is one integer and it is asked for on every page load, where the
-- rows behind it grow for the life of the building.

create function cash_on_hand_before(p_property_id uuid, p_date date)
returns integer
language plpgsql
stable
as $function$
declare
  v_start timestamptz;
  v_taken bigint;
  v_banked bigint;
begin
  -- Midnight in the property's own zone, as a real instant. Comparing
  -- `collected_at` against a converted *column* would read every payment ever
  -- taken; converting the boundary once keeps the index on
  -- (property_id, collected_at) usable.
  select p_date::timestamp at time zone p.time_zone
  into v_start
  from property p
  where p.id = p_property_id;

  if v_start is null then
    return null;
  end if;

  select coalesce(sum(p.amount_cents), 0)
  into v_taken
  from payment p
  where p.property_id = p_property_id
    and p.method = 'cash'
    and p.status = 'verified'
    and p.collected_at < v_start;

  select coalesce(sum(b.amount_cents), 0)
  into v_banked
  from cash_banking b
  where b.property_id = p_property_id
    and b.business_date < p_date;

  -- Cash booking payments only, matching what the cash-up counts: a security
  -- deposit is a liability rather than takings (prd.md §11), so it is never in
  -- this balance even though the notes share the drawer. N27 is the question
  -- of whether Finance would rather count the drawer as one figure.
  return (v_taken - v_banked)::integer;
end;
$function$;

revoke execute on function cash_on_hand_before(uuid, date) from public, anon, authenticated;
grant execute on function cash_on_hand_before(uuid, date) to service_role;
