-- ═══════════════════════════════════════════════════════════════════════════
-- The link, found again (capability A9; architecture.md §3, §4a).
--
-- Until now `booking.access_token` was minted in exactly one place — the
-- moment a customer booked online — and architecture.md §5.1 read the nulls
-- accordingly: "every booking taken at the desk has no link and needs none."
-- Capability A9 is what makes that stop being true. A customer who books at
-- the counter, or one who books online and closes the tab before the email
-- that N42 has not switched on yet, arrives at the lookup form with a
-- reference and a phone number and no link at all. Refusing them because the
-- column happens to be null would be refusing the people the screen exists
-- for.
--
-- So a null is now "no link **yet**", and this is the one place it is filled
-- in. Three properties make that safe to do from an anonymous request:
--
--   1. **It is idempotent.** A booking that already has a token gets that
--      token back and nothing is written — no second row, no second history
--      entry, and the same URL on the second lookup as on the first. This is
--      the settings rule from architecture.md §4 in a different costume: a
--      save that changes nothing writes nothing, so a customer refreshing an
--      anxious page cannot fabricate history.
--   2. **It leaves a trail.** Minting a permanent credential against somebody
--      else's booking record is the one thing on this path that would
--      otherwise happen invisibly, and architecture.md §8.1's rule for signed
--      URLs — "opening logs then signs" — is the same argument one rung out.
--      `audit_event.actor_id` has been nullable since it was created, for
--      exactly this kind of caller.
--   3. **The row is locked before it is read.** Two lookups of the same
--      untokened booking at the same instant must not mint two tokens and
--      hand each caller a different link. `for update` serialises exactly
--      those two.
--
-- **The token is not in the audit payload.** `create_public_stay_booking`
-- puts it in its own, which is defensible for a creation record; repeating it
-- here would put a second copy of a live credential in an append-only table
-- that nothing can delete from, for no gain — the `booking` row has it, and
-- anyone who can read the trail can already open the booking.
-- ═══════════════════════════════════════════════════════════════════════════

create function issue_booking_access_token(
  p_property_id uuid,
  p_booking_id  uuid,
  p_token       text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_existing text;
begin
  select access_token
    into v_existing
    from booking
   where property_id = p_property_id
     and id = p_booking_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Already has one. Hand it back and write nothing: the customer gets the
  -- same URL they got last time, and the trail records the issue once.
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'access_token', v_existing);
  end if;

  update booking
     set access_token = p_token
   where property_id = p_property_id
     and id = p_booking_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id,
    null,
    'booking.link_issued',
    'booking',
    p_booking_id,
    null,
    jsonb_build_object('issued', true)
  );

  return jsonb_build_object('ok', true, 'access_token', p_token);

exception
  when unique_violation then
    -- The token collided, which at 128 bits of randomness means the caller
    -- reused one. Returned rather than raised so the action can mint another
    -- and try again instead of showing a customer a stack trace — the same
    -- shape `create_public_stay_booking` uses for the same failure.
    return jsonb_build_object('ok', false, 'error', 'token_collision');
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants. Unauthenticated at the browser and privileged at the server:
-- architecture.md §2 keeps every query behind lib/supabase/data.ts, so
-- "anonymous" describes the customer and never the database connection.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function issue_booking_access_token(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function issue_booking_access_token(uuid, uuid, text) to service_role;
