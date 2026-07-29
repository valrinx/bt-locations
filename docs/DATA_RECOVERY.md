# Data backup and recovery

## Protection layers

1. **Supabase** is the live source of truth.
2. **GitHub Actions** exports the `locations` table every day at 03:17
   Asia/Bangkok. Each artifact is retained for 90 days.
3. **Soft delete** retains deleted rows in Supabase.
4. **Browser cache and Undo/Redo** provide fast local recovery. Undo/Redo also
   reconciles the restored snapshot back to Supabase.
5. **Manual Export** downloads a portable JSON copy from the app.

The scheduled backup refuses to upload an artifact when fewer than 1,000 active
locations are returned. This prevents an empty or severely truncated table from
being accepted as a healthy backup.

## Enable recovery and permissions

Apply these files once in the Supabase SQL editor, in order:

`supabase_migrations/002_soft_delete_locations.sql`

`supabase_migrations/003_auth_permissions.sql`

For per-location revision history, workflow fields, duplicate merge, bulk update,
and one-click rollback, also apply:

`supabase_migrations/004_field_operations.sql`

This migration is additive and keeps existing rows valid. Every later insert,
update, soft delete, restore, merge, and rollback is recorded in
`location_revisions`. Users with Restore permission can roll back one location
without replacing the rest of the database.

Migration 003 removes anonymous write access. Restore operations require a
signed-in user with the **Restore** permission; deleting existing rows during a
Replace import additionally requires **Delete**.

## Create and verify a backup locally

```bash
python backup_supabase.py --output backup-output/supabase_locations.json
```

The file includes active rows, soft-deleted rows, row counts, a UTC timestamp,
and a SHA-256 checksum.

## Download an automatic backup

1. Open the GitHub repository.
2. Open **Actions** and select **Backup Supabase Locations**.
3. Open a successful run from before the incident.
4. Download the `supabase-locations-<run id>` artifact.
5. Extract `supabase_locations.json`.

## Restore safely

Always run a dry run first:

```bash
python restore_supabase.py path/to/supabase_locations.json
```

The restore is additive: existing active rows are preserved, soft-deleted rows
are reactivated, and missing rows are inserted. It never deletes or overwrites
an existing active row.

After reviewing the counts:

```powershell
$env:SUPABASE_AUTH_EMAIL = "approved-user@example.com"
$env:SUPABASE_AUTH_PASSWORD = "your-password"
python restore_supabase.py path/to/supabase_locations.json --apply
```

The account must have the Restore permission. As an alternative, provide a
short-lived `SUPABASE_ACCESS_TOKEN`. Never save a password or access token in
the repository.

An approved user can also choose **Restore** in the app and select the
`supabase_locations.json` backup. The app validates its schema, metadata count,
and coordinates before asking for confirmation.

Create another backup immediately after restoration and compare its count and
checksum.

## Device format or browser reset

Opening the app online reloads locations from Supabase. Browser-only data such
as favorites, local changelog entries, and saved GPS paths is not currently
stored in Supabase and must be exported separately if it needs to survive a
device format.
