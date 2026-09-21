-- Rename the legacy warehouse source enum value to the ANNDATA product name.
-- Safe for existing databases: no-op when the enum is already migrated.
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
