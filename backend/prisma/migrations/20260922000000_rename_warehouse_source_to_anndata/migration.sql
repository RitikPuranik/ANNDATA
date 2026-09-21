-- Rename the legacy warehouse source enum value to ANNDATA.
-- Safe for existing databases and idempotent when already migrated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'WarehouseSourceType'
      AND e.enumlabel = 'FARMLINK'
  ) THEN
    ALTER TYPE "WarehouseSourceType" RENAME VALUE 'FARMLINK' TO 'ANNDATA';
  END IF;
END $$;
