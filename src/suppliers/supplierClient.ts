import { z } from 'zod';
import { config } from '../config';
import { logger } from '../logger';
import type { SupplierHotel, SupplierId } from '../domain/types';

/**
 * HTTP client the Temporal activities use to talk to the supplier APIs. The
 * mock suppliers happen to be hosted by this same service, but they are called
 * over the network like any third party would be.
 */
const log = logger.child({ component: 'supplier-client' });

const SUPPLIER_URLS: Record<SupplierId, string> = {
  A: config.SUPPLIER_A_URL,
  B: config.SUPPLIER_B_URL,
};

const SupplierHotelSchema = z.object({
  hotelId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().finite().positive(),
  city: z.string().min(1),
  commissionPct: z.number().finite().min(0).max(100),
});

/** Thrown for responses we should not bother retrying (4xx, malformed body). */
export class SupplierPermanentError extends Error {
  readonly supplier: SupplierId;
  readonly status?: number;

  constructor(supplier: SupplierId, message: string, status?: number) {
    super(message);
    this.name = 'SupplierPermanentError';
    this.supplier = supplier;
    this.status = status;
  }
}

/** Thrown for timeouts, network errors and 5xx — worth another attempt. */
export class SupplierTransientError extends Error {
  readonly supplier: SupplierId;
  readonly status?: number;

  constructor(supplier: SupplierId, message: string, status?: number) {
    super(message);
    this.name = 'SupplierTransientError';
    this.supplier = supplier;
    this.status = status;
  }
}

export function supplierUrl(supplier: SupplierId): string {
  return SUPPLIER_URLS[supplier];
}

export async function fetchSupplierHotels(
  supplier: SupplierId,
  city: string,
): Promise<{ hotels: SupplierHotel[]; latencyMs: number }> {
  const url = new URL(SUPPLIER_URLS[supplier]);
  url.searchParams.set('city', city);

  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(config.SUPPLIER_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new SupplierTransientError(
      supplier,
      timedOut
        ? `Supplier ${supplier} timed out after ${config.SUPPLIER_TIMEOUT_MS}ms`
        : `Supplier ${supplier} is unreachable: ${reason}`,
    );
  }

  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    const body = await safeReadBody(response);
    const message = `Supplier ${supplier} responded ${response.status}${body ? `: ${body}` : ''}`;
    // 429 is rate limiting, which is worth backing off and retrying.
    if (response.status >= 500 || response.status === 429) {
      throw new SupplierTransientError(supplier, message, response.status);
    }
    throw new SupplierPermanentError(supplier, message, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new SupplierPermanentError(
      supplier,
      `Supplier ${supplier} returned a body that is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      response.status,
    );
  }

  if (!Array.isArray(payload)) {
    throw new SupplierPermanentError(supplier, `Supplier ${supplier} did not return a JSON array`);
  }

  // One malformed row should not sink the whole feed; drop it and carry on.
  const hotels: SupplierHotel[] = [];
  let rejected = 0;
  for (const row of payload) {
    const parsed = SupplierHotelSchema.safeParse(row);
    if (parsed.success) {
      hotels.push(parsed.data);
    } else {
      rejected += 1;
    }
  }

  if (rejected > 0) {
    log.warn({ supplier, city, rejected }, 'Dropped malformed hotel rows from supplier feed');
  }

  return { hotels, latencyMs };
}

/** Lightweight probe used by /health — cheap, short timeout, no parsing. */
export async function probeSupplier(
  supplier: SupplierId,
): Promise<{ ok: boolean; latencyMs: number; status?: number; error?: string }> {
  const url = new URL(SUPPLIER_URLS[supplier]);
  url.searchParams.set('city', '__health__');
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(Math.min(config.SUPPLIER_TIMEOUT_MS, 2_000)),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return { ok: false, latencyMs, status: response.status, error: `HTTP ${response.status}` };
    }
    return { ok: true, latencyMs, status: response.status };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}
