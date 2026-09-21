import { WarehouseDataProvider, WarehouseProviderRequest, WarehouseProviderResult } from "./warehouse-data-provider";

/**
 * The ANNDATA provider represents warehouses already registered directly
 * in ANNDATA (created through the existing Warehouse Intelligence module's
 * own create/update flow — Part 1).
 *
 * It deliberately does NOT read the warehouses table and translate rows
 * back into ExternalWarehouseRecord: ANNDATA is already the canonical
 * source of truth for its own records, so "fetching" them through this
 * provider only to normalize/validate/upsert them straight back into the
 * same table would be pure ceremony — a warehouse a ANNDATA user creates
 * is already correctly persisted, owned, and searchable the moment the
 * existing Part 1 create endpoint returns. There is nothing for a sync run
 * to add.
 *
 * The provider still exists (rather than simply omitting a ANNDATA entry
 * from the registry) so the registry's uniform "one provider per source
 * type, one status per source type" shape holds even for ANNDATA, and so
 * a future need (e.g. re-publishing ANNDATA warehouses to an external
 * partner feed) has an obvious, already-wired place to grow into instead
 * of inventing a new integration point.
 */
export class ANNDATAWarehouseProvider implements WarehouseDataProvider {
  readonly providerId = "anndata";
  readonly providerType = "ANNDATA" as const;

  async fetchWarehouses(_request: WarehouseProviderRequest): Promise<WarehouseProviderResult> {
    return {
      provider: { id: this.providerId, type: this.providerType },
      status: "SUCCESS",
      warehouses: [],
      metadata: { fetchedAt: new Date(), recordCount: 0 },
    };
  }
}
