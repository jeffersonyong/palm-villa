-- ═══════════════════════════════════════════════════════════════════════════
-- Accounting packs: staleness asked once, so a screen and the nightly job
-- cannot disagree about it (capability G5, architecture.md §8.2).
--
-- ── The bug this closes ───────────────────────────────────────────────────
--
-- `bookings_due_accounting_pack` (migration 20260908000100) decides a pack is
-- behind when anything it records has moved: the booking, the newest verified
-- payment, or the attaching OR removal of an identity document or a slip. The
-- booking screen decided the same question on its own, and looked only at
-- verifications. So a slip attached after a pack was built left the database
-- correctly treating the pack as due while the screen showed it as current —
-- a pack presented as up to date that was silently missing the slip somebody
-- had just added.
--
-- Two readings of one rule is the fault, not the missing clause. The rule now
-- lives in `accounting_pack_changed_at()` and the due-list calls it, so the
-- screen asks the database the same question the job does rather than keeping
-- a second copy in TypeScript.
--
-- NULL means "no pack is due" — there is no verified payment, so there is
-- nothing to assemble. That is the `paid` CTE's condition, expressed as the
-- absence of an answer rather than as a second thing for callers to check.
-- ═══════════════════════════════════════════════════════════════════════════

create function accounting_pack_changed_at(p_property_id uuid, p_booking_id uuid)
returns timestamptz
language sql
stable
as $function$
  select greatest(
    b.updated_at,
    max(p.verified_at),
    (
      select max(d.uploaded_at)
      from document d
      where d.property_id = p_property_id
        and d.booking_id = b.id
        and d.kind in ('identity', 'payment_slip')
        and d.deleted_at is null
    ),
    (
      select max(d.deleted_at)
      from document d
      where d.property_id = p_property_id
        and d.booking_id = b.id
        and d.kind in ('identity', 'payment_slip')
        and d.deleted_reason = 'removed'
    )
  )
  from booking b
  join payment p
    on p.booking_id = b.id
   and p.property_id = b.property_id
   and p.status = 'verified'
  where b.property_id = p_property_id
    and b.id = p_booking_id
  group by b.id, b.updated_at
$function$;

comment on function accounting_pack_changed_at is
  'When a booking last changed in a way its accounting pack records, or NULL when no pack is due (capability G5). The one definition of stale: read by the nightly due-list and by the booking screen.';

-- Same signature, same result, one less copy of the rule.
create or replace function bookings_due_accounting_pack(
  p_property_id uuid,
  p_limit integer default 25
)
returns table (booking_id uuid, changed_at timestamptz)
language sql
stable
as $function$
  with paid as (
    select distinct b.id
    from booking b
    join payment p
      on p.booking_id = b.id
     and p.property_id = b.property_id
     and p.status = 'verified'
    where b.property_id = p_property_id
  ),
  live_pack as (
    select d.booking_id, max(d.assembled_from) as assembled_from
    from document d
    where d.property_id = p_property_id
      and d.kind = 'accounting_pack'
      and d.deleted_at is null
    group by d.booking_id
  )
  select paid.id, changed.at
  from paid
  cross join lateral (
    select accounting_pack_changed_at(p_property_id, paid.id) as at
  ) changed
  left join live_pack lp on lp.booking_id = paid.id
  where changed.at is not null
    and (lp.assembled_from is null or lp.assembled_from < changed.at)
  order by changed.at
  limit greatest(coalesce(p_limit, 25), 1)
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants — service-role only, like every reader and writer in this schema.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function accounting_pack_changed_at(uuid, uuid)
  from public, anon, authenticated;
grant execute on function accounting_pack_changed_at(uuid, uuid) to service_role;
