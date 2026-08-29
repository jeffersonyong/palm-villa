-- Append-only audit trail.
--
-- architecture.md §4: "Approvals are events, not flags. Any action carrying an
-- approval semantic (deposit release, charge waiver, manual payment match)
-- writes an audit_event row with actor, action, entity, before/after,
-- timestamp. The audit table is append-only; no update or delete grants exist
-- on it."
--
-- prd.md §11 makes the reason explicit for the case that matters most: "the
-- audit trail is the point of an approval step". A status flag records that
-- something was approved; it cannot record who approved it, when, or what the
-- figures were at the time — which is precisely what a disputed deposit
-- deduction turns on. Same for prd.md §15's blanket requirement that all state
-- changes on bookings, payments, deposits and charges carry actor and time.

create table audit_event (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  -- auth.users.id once the auth slice lands. Null means the action had no
  -- authenticated actor, which today is every action — requirePermission()
  -- permits everything in development and fails closed in production.
  actor_id uuid,
  -- Dotted verb, e.g. `booking.created_walk_in`, `deposit.released`.
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  -- Null on creation; a shape snapshot otherwise. Deliberately jsonb rather
  -- than typed columns: the audit trail must survive schema change without
  -- rewriting history.
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_event_entity_idx on audit_event (property_id, entity_type, entity_id, at desc);
create index audit_event_property_at_idx on audit_event (property_id, at desc);

-- Append-only, enforced two ways. Grants stop a client that has been given the
-- table; the trigger stops everything else, including a privileged role and a
-- careless migration. Statement-level so it fires even when the statement would
-- have matched no rows.
create function reject_audit_event_mutation() returns trigger
language plpgsql
as $function$
begin
  raise exception
    'audit_event is append-only (architecture.md 4): % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$function$;

create trigger audit_event_rejects_update
  before update on audit_event
  for each statement
  execute function reject_audit_event_mutation();

create trigger audit_event_rejects_delete
  before delete on audit_event
  for each statement
  execute function reject_audit_event_mutation();

revoke update, delete on audit_event from public, anon, authenticated, service_role;

-- TRUNCATE is deliberately left alone. It is not reachable from the
-- application — nothing in lib/db issues one — and the integration test setup
-- uses it to reset the transactional tables between tests. Blocking it would
-- buy nothing and cost the test suite its isolation.
