-- Role administration, in one transaction each (capabilities F1/F2).
--
-- Editing a role's permission set, or a user's role set, is a replace of a
-- small row collection plus an audit event — and the two must be atomic, or a
-- failure between them leaves either an unaudited change or an audit of a
-- change that never happened. Same pattern as create_walk_in_booking and
-- transition_booking: the write and its audit event share a transaction.
--
-- Auditing role administration is not enumerated in architecture.md §4's
-- examples, but F4 promises the owner the full audit trail and a role change
-- alters what every other event could have been — recorded in
-- architecture.md §4 as an assumption by the auth slice.
--
-- Replace (delete + insert) rather than diff: the audit row carries the full
-- before/after arrays, so no information is lost, and the write cannot drift
-- from what was submitted. The CHECK constraint on role_permission.permission
-- (000400) still validates every string — an unknown one aborts the whole
-- transaction, audit event included.

create function set_role_permissions(
  p_property_id uuid,
  p_role_id uuid,
  p_permissions text[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
as $function$
declare
  v_before text[];
  v_after text[];
begin
  -- Serialise concurrent edits of the same role; also confirms it exists.
  perform 1 from staff_role
  where id = p_role_id and property_id = p_property_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'role_not_found');
  end if;

  select coalesce(array_agg(permission order by permission), '{}') into v_before
  from role_permission
  where role_id = p_role_id and property_id = p_property_id;

  delete from role_permission
  where role_id = p_role_id and property_id = p_property_id;

  insert into role_permission (property_id, role_id, permission)
  select distinct p_property_id, p_role_id, unnest(p_permissions);

  select coalesce(array_agg(permission order by permission), '{}') into v_after
  from role_permission
  where role_id = p_role_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id,
    p_actor_id,
    'role.permissions_set',
    'staff_role',
    p_role_id,
    jsonb_build_object('permissions', to_jsonb(v_before)),
    jsonb_build_object('permissions', to_jsonb(v_after))
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke execute on function set_role_permissions(uuid, uuid, text[], uuid)
  from public, anon, authenticated;

grant execute on function set_role_permissions(uuid, uuid, text[], uuid)
  to service_role;

-- Same shape for a user's role set. The entity is the staff member; the
-- before/after carry role ids, which the audit screen resolves to names —
-- ids stay true even if a role is later renamed.
create function set_user_roles(
  p_property_id uuid,
  p_user_id uuid,
  p_role_ids uuid[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
as $function$
declare
  v_before uuid[];
  v_after uuid[];
begin
  select coalesce(array_agg(role_id order by role_id), '{}') into v_before
  from user_role
  where user_id = p_user_id and property_id = p_property_id;

  delete from user_role
  where user_id = p_user_id and property_id = p_property_id;

  insert into user_role (user_id, property_id, role_id)
  select distinct p_user_id, p_property_id, unnest(p_role_ids);

  select coalesce(array_agg(role_id order by role_id), '{}') into v_after
  from user_role
  where user_id = p_user_id and property_id = p_property_id;

  insert into audit_event (
    property_id, actor_id, action, entity_type, entity_id, before, after
  )
  values (
    p_property_id,
    p_actor_id,
    'staff.roles_set',
    'staff_user',
    p_user_id,
    jsonb_build_object('role_ids', to_jsonb(v_before)),
    jsonb_build_object('role_ids', to_jsonb(v_after))
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke execute on function set_user_roles(uuid, uuid, uuid[], uuid)
  from public, anon, authenticated;

grant execute on function set_user_roles(uuid, uuid, uuid[], uuid)
  to service_role;
