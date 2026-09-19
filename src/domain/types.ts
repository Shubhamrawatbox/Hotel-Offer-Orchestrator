/**
 * Shared domain types. This module is intentionally dependency-free so that it
 * can be imported (as types only) from Temporal workflow code, which runs in a
 * deterministic sandbox and must not pull in Node built-ins.
 */

export type SupplierId = 'A' | 'B';

export const SUPPLIER_IDS: readonly SupplierId[] = ['A', 'B'] as const;

/** Public-facing supplier labels, used verbatim in the API response. */
export const SUPPLIER_LABELS: Record<SupplierId, string> = {
  A: 'Supplier A',
  B: 'Supplier B',
};

/** The raw shape returned by a supplier API. */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

/** The winning offer for a hotel — this is exactly the API response shape. */
export interface HotelOffer {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

export interface SupplierFetchResult {
  supplier: SupplierId;
  hotels: SupplierHotel[];
  latencyMs: number;
}

export interface SupplierFailure {
  supplier: SupplierId;
  message: string;
}

export interface HotelSearchInput {
  city: string;
  minPrice?: number;
  maxPrice?: number;
  requestId: string;
}

export type OfferSource = 'suppliers' | 'redis';

export interface HotelSearchResult {
  city: string;
  offers: HotelOffer[];
  /** `redis` when a price filter was applied, because filtering happens in Redis. */
  source: OfferSource;
  suppliersSucceeded: SupplierId[];
  suppliersFailed: SupplierFailure[];
  /** Deduplicated count before any price filtering was applied. */
  totalBeforeFilter: number;
  cacheHit: boolean;
}
