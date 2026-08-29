// Creates the first Admin account — the one that can then create every other
// staff account from the portal (architecture.md §3: accounts are
// admin-created, no self-registration; someone has to be first).
//
// Run against the local stack:
//
//   node --env-file=.env.local scripts/bootstrap-admin.mjs
//   (or: npm run db:bootstrap-admin)
//
// Against production: run once from an operator machine with the prod values
// in the environment. Credentials come from the environment, never from the
// repository or the command line (a password in argv lands in shell history).
//
// Idempotent on purpose: re-running after a partial failure, or against a
// database that already has the admin, converges instead of erroring — the
// same reasoning as the seed.

import { createClient } from '@supabase/supabase-js'

function required(name) {
  const value = process.env[name]

  if (!value || value.trim() === '') {
    console.error(`Missing ${name}. Set it in the environment (see .env.example) and re-run.`)
    process.exit(1)
  }

  return value
}

const url = required('NEXT_PUBLIC_SUPABASE_URL')
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY')
const email = required('BOOTSTRAP_ADMIN_EMAIL')
const password = required('BOOTSTRAP_ADMIN_PASSWORD')
const displayName = required('BOOTSTRAP_ADMIN_NAME')

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** The auth user, created or found. */
async function ensureUser() {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    // No confirmation email: provisioning is out-of-band (architecture.md §3).
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })

  if (!error) {
    console.log(`Created auth user ${email}.`)
    return data.user
  }

  if (error.code !== 'email_exists') {
    console.error(`Could not create the auth user: ${error.message}`)
    process.exit(1)
  }

  // Already exists — find them. listUsers has no email filter worth trusting
  // across GoTrue versions, so page through; a bootstrap-sized user count
  // makes this cheap.
  for (let page = 1; page <= 20; page += 1) {
    const { data: pageData, error: listError } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    })

    if (listError) {
      console.error(`Could not list users: ${listError.message}`)
      process.exit(1)
    }

    const match = pageData.users.find(
      (user) => (user.email ?? '').toLowerCase() === email.toLowerCase(),
    )

    if (match) {
      console.log(`Auth user ${email} already exists.`)
      return match
    }

    if (pageData.users.length < 100) break
  }

  console.error(`GoTrue says ${email} exists, but it was not found by listing users.`)
  process.exit(1)
}

async function singleRow(table, columns, filters) {
  let query = supabase.from(table).select(columns)

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value)
  }

  const { data, error } = await query

  if (error) {
    console.error(`Could not read ${table}: ${error.message}`)
    process.exit(1)
  }

  if (data.length !== 1) {
    console.error(
      `Expected exactly one row in ${table} for ${JSON.stringify(filters)}, found ${data.length}. Run \`npm run db:reset\` (the seed creates the property and the roles).`,
    )
    process.exit(1)
  }

  return data[0]
}

const user = await ensureUser()
const property = await singleRow('property', 'id', {})
const adminRole = await singleRow('staff_role', 'id', {
  property_id: property.id,
  slug: 'admin',
})

const { error: grantError } = await supabase.from('user_role').upsert(
  {
    user_id: user.id,
    property_id: property.id,
    role_id: adminRole.id,
  },
  { onConflict: 'user_id,role_id' },
)

if (grantError) {
  console.error(`Could not grant the admin role: ${grantError.message}`)
  process.exit(1)
}

console.log(`${email} holds the Admin role. Sign in at /login and change the password.`)
