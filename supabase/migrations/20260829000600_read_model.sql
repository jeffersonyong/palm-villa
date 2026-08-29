-- The read model the portal's screens sit on.
--
-- A booking is spread across five tables by the time it is normalised, and
-- every list screen wants the same shape back: reference, guest, unit, dates,
-- money, status. Assembling that in the query layer would mean either a join
-- expressed in PostgREST filter syntax or several round trips per row; putting
-- it in a view keeps lib/db thin and keeps the half-open range semantics in one
-- place, next to the constraint that enforces them.
--
-- `security_invoker` so the view respects the caller's row-level security
-- rather than the view owner's. Nothing depends on it today — the data client
-- is service-role and RLS has no policies — but a view that quietly bypasses
-- RLS is exactly the kind of thing the auth slice would not think to check.

create view booking_summary
with (security_invoker = true)
as
select
  b.id,
  b.property_id,
  b.reference,
  b.status,
  b.stream,
  g.name as guest_name,
  g.phone as guest_phone,
  b.vehicle_registration,
  b.chargeable_guests,
  b.exempt_guests,
  b.total_cents,
  b.security_deposit_cents,
  b.hold_expires_at,
  b.created_at,
  o.unit_id,
  u.ref as unit_ref,
  ut.slug as unit_type_slug,
  o.start_date as check_in,
  o.end_date as check_out,
  coalesce(l.lines, '[]'::jsonb) as lines
from booking b
join guest g on g.id = b.guest_id
join occupancy o on o.booking_id = b.id
join unit u on u.id = o.unit_id
join unit_type ut on ut.id = u.unit_type_id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'type', bl.line_type,
      'description', bl.description,
      'quantity', bl.quantity,
      'unitPrice', bl.unit_price_cents,
      'amount', bl.amount_cents
    )
    order by bl.sort_order
  ) as lines
  from booking_line bl
  where bl.booking_id = b.id
) l on true;

comment on view booking_summary is
  'Bookings that occupy a unit. Day passes occupy no unit (prd.md 6.1) and are joined out by construction; they get their own read model when the day-pass flow lands in phase two.';

-- Units free for the whole range.
--
-- Half-open on both sides, so a unit whose previous booking ends on the
-- check-in date is free — the same semantics as the exclusion constraint, which
-- is what stops the availability list and the database disagreeing at the
-- boundary and offering a unit the write would then refuse.
--
-- Cancelled and expired occupancies release their unit, matching the
-- constraint's `where` clause exactly.
create function available_units(
  p_property_id uuid,
  p_start date,
  p_end date,
  p_unit_type_slug text default null
)
returns table (
  id uuid,
  ref text,
  unit_type_slug text,
  unit_type_name text
)
language sql
stable
as $function$
  select u.id, u.ref, ut.slug, ut.name
  from unit u
  join unit_type ut on ut.id = u.unit_type_id
  where u.property_id = p_property_id
    and (p_unit_type_slug is null or ut.slug = p_unit_type_slug)
    and not exists (
      select 1
      from occupancy o
      where o.unit_id = u.id
        and o.status not in ('expired', 'cancelled')
        and daterange(o.start_date, o.end_date, '[)')
            && daterange(p_start, p_end, '[)')
    )
  order by u.ref;
$function$;

-- Availability counts per unit type, for the "3 of 36 free" summary. Every type
-- appears, including those with nothing free and those with no units at all, so
-- the screen can show a zero rather than silently omitting a row.
create function count_available_units_by_type(
  p_property_id uuid,
  p_start date,
  p_end date
)
returns table (
  unit_type_slug text,
  available bigint
)
language sql
stable
as $function$
  select ut.slug, count(a.id)
  from unit_type ut
  left join available_units(p_property_id, p_start, p_end) a
    on a.unit_type_slug = ut.slug
  where ut.property_id = p_property_id
  group by ut.slug;
$function$;

revoke execute on function available_units(uuid, date, date, text) from public, anon, authenticated;
revoke execute on function count_available_units_by_type(uuid, date, date) from public, anon, authenticated;

grant execute on function available_units(uuid, date, date, text) to service_role;
grant execute on function count_available_units_by_type(uuid, date, date) to service_role;
