-- Roles, permissions and role assignments.
--
-- architecture.md §4: "Three tables: roles, role_permissions, user_roles. Users
-- hold one or more roles; effective permissions are the union. Permission
-- strings are the atomic unit. Roles are data, not code: editing a role's
-- permission set is an Admin UI operation."
--
-- prd.md §4 records why one user holding several roles is the design rather
-- than a convenience: the real team structure is uncertain, and if Jason is
-- Front Office, Finance and Admin simultaneously he is assigned all three. If
-- those functions later separate into different people, roles are reassigned
-- with no code change.
--
-- Enforcement stays in the server layer — requirePermission() at the top of
-- every server action — because permission logic is richer than a row filter
-- (§4: "approve is only available once inspection is recorded"). These tables
-- are the data that helper will read once the auth slice lands.

create table staff_role (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property (id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (property_id, slug),
  unique (property_id, id)
);

comment on table staff_role is
  'The prd.md 4 predefined roles. Named staff_role rather than role to keep clear water between application roles and Postgres roles, which are a different thing entirely and appear in the same migrations.';

-- The permission set is closed, and checked. Permissions are the atomic unit of
-- enforcement and each one is read somewhere in TypeScript, so a new permission
-- is a code change and belongs in a migration — unlike a role's permission set,
-- which is data and is edited in the admin UI. This check is what catches a
-- typo in the seed rather than letting it become a permission nobody holds.
create table role_permission (
  property_id uuid not null references property (id) on delete cascade,
  role_id uuid not null,
  permission text not null check (
    permission in (
      'booking.view', 'booking.create', 'booking.amend', 'booking.cancel',
      'booking.override_hold', 'payment.verify', 'payment.record_cash',
      'inspection.record', 'charge.create', 'charge.waive',
      'deposit.approve_release', 'unit.manage', 'tenancy.manage',
      'config.manage', 'report.view', 'document.view_identity'
    )
  ),
  primary key (role_id, permission),
  foreign key (property_id, role_id) references staff_role (property_id, id) on delete cascade
);

create table user_role (
  -- auth.users.id. The foreign key is added by the auth slice, which is what
  -- creates staff accounts; adding it now would reference a table this slice
  -- does not otherwise touch.
  user_id uuid not null,
  property_id uuid not null references property (id) on delete cascade,
  role_id uuid not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id),
  foreign key (property_id, role_id) references staff_role (property_id, id) on delete cascade
);

create index user_role_property_user_idx on user_role (property_id, user_id);
