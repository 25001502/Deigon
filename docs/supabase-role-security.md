# Supabase role-security rollout prerequisite

**No production account should be promoted to ADMIN until this inspection is
completed and reviewed.** Admin A does not assume any deployed RLS/grant state and
does not install grants or policies. Capture the environment, date, query results,
reviewer, and decision in a private operational review record.

Run the following read-only queries manually as a trusted operator in the intended
Supabase SQL Editor. They inspect catalogs; they do not simulate a customer request
and do not change data or permissions. A successful SQL Editor query by itself
says nothing about what an `authenticated` Data API client can do.

## 1. Table security and policies

```sql
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'User';

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'User'
ORDER BY policyname;
ROLLBACK;
```

Review UPDATE **and** INSERT/ALL policies, including `PUBLIC` and inherited roles.
An own-row policy alone can still permit changing `role`. Also inspect whether
DELETE plus INSERT/upsert can replace a profile with a chosen role. RLS being
enabled is not, by itself, proof of safety.

## 2. Explicit and effective privileges

```sql
BEGIN TRANSACTION READ ONLY;
SELECT grantee, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'User'
ORDER BY grantee, privilege_type;

SELECT grantee, column_name, privilege_type, is_grantable
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'User'
ORDER BY grantee, column_name, privilege_type;

SELECT r.rolname, r.rolsuper, r.rolbypassrls,
       has_schema_privilege(r.oid, 'public', 'USAGE') AS schema_usage,
       has_table_privilege(r.oid, 'public."User"', 'SELECT') AS table_select,
       has_table_privilege(r.oid, 'public."User"', 'INSERT') AS table_insert,
       has_table_privilege(r.oid, 'public."User"', 'UPDATE') AS table_update,
       has_table_privilege(r.oid, 'public."User"', 'DELETE') AS table_delete,
       has_column_privilege(r.oid, 'public."User"', 'role', 'UPDATE') AS role_update,
       has_column_privilege(r.oid, 'public."User"', 'role', 'INSERT') AS role_insert
FROM pg_roles AS r WHERE r.rolname IN ('anon', 'authenticated');

SELECT caller.rolname AS caller, inherited.rolname AS inherited_role,
       pg_has_role(caller.oid, inherited.oid, 'MEMBER') AS is_member,
       pg_has_role(caller.oid, inherited.oid, 'USAGE') AS privileges_available
FROM pg_roles AS caller CROSS JOIN pg_roles AS inherited
WHERE caller.rolname IN ('anon', 'authenticated')
  AND caller.oid <> inherited.oid
  AND pg_has_role(caller.oid, inherited.oid, 'MEMBER');
ROLLBACK;
```

Effective privilege functions account for table-level and inherited grants, unlike
checking a single column ACL. `role_update = true` means the privilege exists;
RLS may still restrict rows. Evaluate both together. Revoking only a column grant
does not override an existing table-wide UPDATE grant. If the effective result or
policy interaction is unclear, keep rollout blocked and review a separate fix.

## 3. Functions, triggers, and indirect write paths

In Supabase API settings, first record whether the Data API is enabled and every
exposed schema. Expand the schema list below to match that configuration; `public`
is only the initial inspection scope, not a claim about your project's settings.

```sql
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname AS schema_name, p.oid::regprocedure AS function_signature,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public') AND p.prokind IN ('f', 'p')
ORDER BY n.nspname, p.oid::regprocedure::text;

SELECT t.tgrelid::regclass AS table_name, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       p.oid::regprocedure AS function_signature,
       p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger AS t
JOIN pg_proc AS p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND t.tgrelid IN ('public."User"'::regclass, 'auth.users'::regclass);

SELECT schemaname, viewname, viewowner, definition
FROM pg_views WHERE schemaname IN ('public')
ORDER BY viewname;
ROLLBACK;
```

Inspect every callable function for writes to `User`, arbitrary SQL, role changes,
and calls to other functions (including helpers in non-exposed schemas). Review
SECURITY DEFINER owners and search paths. A text search for `role` cannot prove
safety: dynamic SQL, views, wrappers, and triggers may hide the write path. Review
view grants and triggers if a view offers an indirect update path. The signup
trigger must be enabled and must hard-code CUSTOMER regardless of metadata.

## Acceptance and follow-up

The review must establish that neither anonymous nor ordinary authenticated
clients can set or alter application roles through direct writes, insert/upsert,
views, or RPCs. If the Data API exposes no such access, document why using the
actual configuration. Do not guess from the application code or table editor UI.

Any gaps require a separately reviewed remediation, with regression tests for
customer profile changes and existing application access. Do not blindly apply
RLS or revoke grants in Admin A. After inspection, validate denied role-change
attempts with disposable accounts in a dedicated staging project, never by
attempting a production self-promotion. Only then review first-admin promotion.

References: [Supabase column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[PostgreSQL privilege inspection](https://www.postgresql.org/docs/current/functions-info.html).
