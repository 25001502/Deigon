# DEIGON Admin A access operations

## Rollout gate

**Do not promote any production account to ADMIN until the checks in
[supabase-role-security.md](supabase-role-security.md) are completed and reviewed.**
Repository migrations do not establish the deployed grants, policies, or functions.
An application guard cannot protect a role that a customer can edit through the Data API.

These are manual operator procedures for the Supabase SQL Editor in the explicitly
verified project/environment. They are not migrations, seeds, or application endpoints.
No real account identifiers or credentials belong in this file. Do not run either
transaction until you have reviewed its intended account and environment.

## Identify the account (read only)

Use Supabase Auth to find the existing account UUID. Cross-check it and the expected
email with this query after replacing the placeholder. No account is created here.

```sql
SELECT a.id AS auth_id, a.email AS auth_email,
       u.id AS profile_id, u.email AS profile_email, u.role
FROM auth.users AS a
LEFT JOIN public."User" AS u ON u.id = a.id::text
WHERE a.id = '00000000-0000-0000-0000-000000000000'::uuid;
```

Both UUIDs must match and both emails must equal the expected email exactly. If a
profile is missing or its email is stale, stop and investigate separately. Do not
create a profile, change its UUID, or bypass the checks to complete a promotion.

## Promote one verified CUSTOMER

Replace the two placeholder values in the following complete transaction. The
placeholder guard intentionally prevents running the example unchanged. Run the
entire block together. It locks the identified Auth and profile rows, verifies
identity and the old role, updates only `role` and `updatedAt`, then verifies the
affected count and resulting role. An exception prevents COMMIT; issue `ROLLBACK;`
if the SQL Editor leaves the transaction aborted. For a rehearsal, replace the
final `COMMIT;` with `ROLLBACK;`.

<!-- promotion-sql -->
```sql
BEGIN;
DO $admin_access$
DECLARE
  expected_id uuid := '00000000-0000-0000-0000-000000000000';
  expected_email text := 'replace-me@example.invalid';
  auth_email text;
  profile_email text;
  old_role public."UserRole";
  changed integer;
BEGIN
  IF expected_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR expected_email = 'replace-me@example.invalid' THEN
    RAISE EXCEPTION 'Replace and verify the account placeholders first';
  END IF;

  SELECT a.email INTO STRICT auth_email
  FROM auth.users AS a WHERE a.id = expected_id FOR UPDATE;
  IF auth_email IS DISTINCT FROM expected_email THEN
    RAISE EXCEPTION 'Auth account email does not match';
  END IF;

  SELECT u.email, u.role INTO STRICT profile_email, old_role
  FROM public."User" AS u WHERE u.id = expected_id::text FOR UPDATE;
  IF profile_email IS DISTINCT FROM expected_email OR old_role <> 'CUSTOMER' THEN
    RAISE EXCEPTION 'Profile identity or current role does not match';
  END IF;

  UPDATE public."User"
  SET role = 'ADMIN'::public."UserRole", "updatedAt" = NOW()
  WHERE id = expected_id::text AND email = expected_email AND role = 'CUSTOMER';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 OR NOT EXISTS (
    SELECT 1 FROM public."User"
    WHERE id = expected_id::text AND email = expected_email AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Expected exactly one verified promotion';
  END IF;
END;
$admin_access$;
COMMIT;
```

Repeat the read-only identity query after success. Record the operator, time,
environment, UUID, old/new role, and review reference in your operational audit log.
No password, email, UUID, Auth metadata, addresses, carts, orders, or payments are
changed. Existing product mutation APIs already accept ADMIN accounts, including
stock updates and product deactivation; promotion grants those existing abilities.

## Demote one verified ADMIN

Use the same identity verification and review process. This transaction requires
ADMIN and changes it to CUSTOMER. New protected requests read the role again;
demotion does not revoke the user's ordinary customer session or erase content
already delivered to their browser. It does not cancel an already authorized
operation in progress.

<!-- demotion-sql -->
```sql
BEGIN;
DO $admin_access$
DECLARE
  expected_id uuid := '00000000-0000-0000-0000-000000000000';
  expected_email text := 'replace-me@example.invalid';
  auth_email text;
  profile_email text;
  old_role public."UserRole";
  changed integer;
BEGIN
  IF expected_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR expected_email = 'replace-me@example.invalid' THEN
    RAISE EXCEPTION 'Replace and verify the account placeholders first';
  END IF;

  SELECT a.email INTO STRICT auth_email
  FROM auth.users AS a WHERE a.id = expected_id FOR UPDATE;
  IF auth_email IS DISTINCT FROM expected_email THEN
    RAISE EXCEPTION 'Auth account email does not match';
  END IF;

  SELECT u.email, u.role INTO STRICT profile_email, old_role
  FROM public."User" AS u WHERE u.id = expected_id::text FOR UPDATE;
  IF profile_email IS DISTINCT FROM expected_email OR old_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Profile identity or current role does not match';
  END IF;

  UPDATE public."User"
  SET role = 'CUSTOMER'::public."UserRole", "updatedAt" = NOW()
  WHERE id = expected_id::text AND email = expected_email AND role = 'ADMIN';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 OR NOT EXISTS (
    SELECT 1 FROM public."User"
    WHERE id = expected_id::text AND email = expected_email AND role = 'CUSTOMER'
  ) THEN
    RAISE EXCEPTION 'Expected exactly one verified demotion';
  END IF;
END;
$admin_access$;
COMMIT;
```

Repeat the read-only query and record the result. If any statement fails, roll
back and investigate; do not weaken the expected-role or identity predicates.

## Application behavior

- `/admin/login` uses existing Supabase email/password authentication and a fixed
  `/admin` destination. There is no admin signup or role-change HTTP endpoint.
- `requireAdmin()` verifies Supabase identity and queries the database role on
  every call. Protected pages and their layout call `requireAdminPage()`; APIs
  authorize independently. No cross-request role cache is used.
- Customers and missing profiles are denied without automatically signing out.
  Unexpected authorization failures reach generic error UI.
- Admin pages are dynamic; admin ping sends `private, no-store, max-age=0` for all
  responses. Future admin API handlers must repeat authorization and no-store
  behavior before returning protected data.
- The root storefront providers remain shared. Signing in can hydrate/merge the
  existing cart; signing out also signs out the shared customer session.
- Dashboard sections are placeholders. No management mutations, metrics, or
  manual payment-status controls are added in Admin A.

## Validation

Run `node --test --test-concurrency=1 tests/admin-a/*.mjs`. The role-safety suite
extracts the two marked SQL blocks above and executes them only in a freshly
initialized loopback PostgreSQL cluster, alongside the real signup trigger.
It never reads a production database URL. PostgreSQL binaries are located via
`DEIGON_TEST_PG_BIN`, with the same default as the existing commerce suites.

Run the existing phase 5 and 6A-6E suites, `npx.cmd tsc --noEmit`, `npm.cmd run lint`,
and `npm.cmd run build` before review. Test-only mocked session checks do not
replace staging verification of actual Supabase cookies and deployed policies.
