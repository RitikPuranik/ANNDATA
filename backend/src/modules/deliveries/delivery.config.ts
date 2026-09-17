import { env } from "../../config/env";

/**
 * Module 18 — centralized, env-driven configuration (Step 9/34: do not
 * hardcode arbitrary commercial tolerances). A single global percentage is
 * the configurable "system setting" the build spec asks for; if a future
 * per-crop/per-buyer override is ever needed it should be layered on top
 * of this default, not replace it.
 */

export function getDeliveryQuantityTolerancePercent(): number {
  return env.DELIVERY_QUANTITY_TOLERANCE_PERCENT;
}

export const DELIVERY_RECONCILIATION_ALGORITHM_VERSION = "v1";
