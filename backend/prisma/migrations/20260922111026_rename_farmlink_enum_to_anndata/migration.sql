-- Rename the FARMLINK enum value to ANNDATA to reflect the platform rebrand
-- (the original enum was created in 20260906000000_add_warehouse_ingestion).
ALTER TYPE "WarehouseSourceType" RENAME VALUE 'FARMLINK' TO 'ANNDATA';
