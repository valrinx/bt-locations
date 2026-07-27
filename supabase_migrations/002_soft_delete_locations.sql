-- Add a recoverable trash layer without changing existing location rows.
-- Apply this once in the Supabase SQL editor before relying on soft delete.

ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE INDEX IF NOT EXISTS idx_locations_active
    ON public.locations (created_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_locations_deleted_at
    ON public.locations (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.locations.deleted_at IS
    'Soft-delete timestamp. NULL means the location is active.';

COMMENT ON COLUMN public.locations.deleted_by IS
    'Username recorded by the BT Locations client when soft-deleting.';

-- Recovery examples:
-- Restore one row:
-- UPDATE public.locations
-- SET deleted_at = NULL, deleted_by = NULL
-- WHERE id = '<location uuid>';
--
-- Restore everything deleted in the last 24 hours:
-- UPDATE public.locations
-- SET deleted_at = NULL, deleted_by = NULL
-- WHERE deleted_at >= now() - interval '24 hours';
--
-- Purge only after confirming a valid external backup:
-- DELETE FROM public.locations
-- WHERE deleted_at < now() - interval '90 days';
