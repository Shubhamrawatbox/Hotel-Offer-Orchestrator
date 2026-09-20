/** Shapes returned by the Hotel Offer Orchestrator API. */

export type SupplierId = 'A' | 'B';

/** One deduplicated, best-priced hotel — the body of GET /api/hotels. */
export interface HotelOffer {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

/** A raw row from a supplier feed (GET /supplierA/hotels, /supplierB/hotels). */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface SearchParams {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

/** Everything the API reports about a search run through response headers. */
export interface SearchMeta {
  requestId?: string;
  workflowId?: string;
  runId?: string;
  /** `redis` when a price filter was applied, because Redis does the filtering. */
  source: 'suppliers' | 'redis';
  totalBeforeFilter?: number;
  suppliersSucceeded: string[];
  suppliersFailed: string[];
  degraded: boolean;
  /** Round trip as measured by the browser. */
  durationMs: number;
}

export type SupplierFeed =
  | { status: 'ok'; hotels: SupplierHotel[] }
  | { status: 'unavailable'; reason: string };

export type CheckStatus = 'up' | 'down';

export interface HealthCheck {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
  pollers?: number;
  namespace?: string;
  [key: string]: unknown;
}

export type OverallStatus = 'ok' | 'degraded' | 'down';

export type CheckName = 'redis' | 'temporal' | 'worker' | 'supplierA' | 'supplierB';

export interface HealthReport {
  status: OverallStatus;
  uptimeSeconds: number;
  checkedAt: string;
  durationMs: number;
  checks: Partial<Record<CheckName, HealthCheck>>;
}

export interface SupplierOutage {
  supplier: SupplierId;
  down: boolean;
}

export interface ErrorDetail {
  field: string;
  message: string;
}
