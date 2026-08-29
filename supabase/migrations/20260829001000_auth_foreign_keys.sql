-- The foreign keys deferred to the auth slice.
--
-- 000400 left user_role.user_id dangling ("The foreign key is added by the
-- auth slice, which is what creates staff accounts") and 000300 said the same
-- of audit_event.actor_id. This is that slice: staff accounts now exist in
-- auth.users, so both columns get their references.

alter table user_role
  add constraint user_role_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

comment on constraint user_role_user_id_fkey on user_role is
  'CASCADE: a role grant is meaningless without its user, and grant rows carry no history worth keeping — the audit trail does.';

-- Deliberately NO ACTION rather than ON DELETE SET NULL: SET NULL is an UPDATE
-- on audit_event, and the append-only triggers from 000300 refuse it, so the FK
-- action would make every user deletion fail with a misleading error. Restrict
-- encodes the actual policy instead: a staff account that has acted is never
-- hard-deleted — it is disabled (a GoTrue ban), keeping the audit trail's
-- actors resolvable forever. actor_id stays nullable for pre-auth rows.
alter table audit_event
  add constraint audit_event_actor_id_fkey
  foreign key (actor_id) references auth.users (id);

-- No RLS policies are added here. 000800 enabled RLS deny-all as defence in
-- depth and that stands: business authorisation lives in the server layer
-- (requirePermission, architecture.md §4), and the data path is the
-- service-role client, which RLS does not constrain.
