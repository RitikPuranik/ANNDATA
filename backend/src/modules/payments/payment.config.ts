/**
 * Module 19 — centralized configuration constant, same convention as
 * Module 18's own delivery.config.ts. Nothing here is a commercial rule
 * (Step 8/17 both explicitly forbid inventing arbitrary adjustments/due
 * dates), so unlike delivery.config.ts there is no env-driven tolerance
 * value — only the algorithm/version tag used for future auditability if
 * the calculation logic in payment-status.calculator.ts ever changes.
 */

export const PAYMENT_STATUS_ALGORITHM_VERSION = "v1";
