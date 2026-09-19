import { ApplicationFailure, log, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import type {
  HotelOffer,
  HotelSearchInput,
  HotelSearchResult,
  SupplierFailure,
  SupplierFetchResult,
  SupplierId,
} from '../domain/types';

/**
 * Workflow code runs in Temporal's deterministic sandbox, so every import here
 * is either from @temporalio/workflow or type-only (erased at compile time).
 * All I/O happens in activities.
 */

/** Supplier calls are the flaky part: short per-attempt timeout, a few quick retries. */
const supplierActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '200ms',
    backoffCoefficient: 2,
    maximumInterval: '2 seconds',
    maximumAttempts: 3,
    // A 4xx or a malformed feed will not fix itself on a retry.
    nonRetryableErrorTypes: ['SupplierPermanentError'],
  },
});

/** Local work (merge + Redis) is fast and safe to retry. */
const localActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '100ms',
    backoffCoefficient: 2,
    maximumInterval: '1 second',
    maximumAttempts: 3,
  },
});

const SUPPLIERS: readonly SupplierId[] = ['A', 'B'];

export async function hotelOfferWorkflow(input: HotelSearchInput): Promise<HotelSearchResult> {
  const { city, minPrice, maxPrice, requestId } = input;
  log.info('Hotel offer search started', { city, minPrice, maxPrice, requestId });

  // 1. Both suppliers are called in parallel; neither waits on the other.
  const settled = await Promise.allSettled(
    SUPPLIERS.map((supplier) => supplierActivities.fetchSupplierOffers({ supplier, city })),
  );

  const succeeded: SupplierFetchResult[] = [];
  const failed: SupplierFailure[] = [];

  settled.forEach((outcome, index) => {
    const supplier = SUPPLIERS[index]!;
    if (outcome.status === 'fulfilled') {
      succeeded.push(outcome.value);
    } else {
      const message = describeFailure(outcome.reason);
      failed.push({ supplier, message });
      log.warn('Supplier call failed, continuing with the remaining suppliers', { supplier, message });
    }
  });

  // 2. One surviving supplier still produces a useful answer; zero does not.
  if (succeeded.length === 0) {
    throw ApplicationFailure.create({
      type: 'AllSuppliersUnavailable',
      message: `No supplier could be reached for city "${city}"`,
      nonRetryable: true,
      details: [{ city, failures: failed }],
    });
  }

  // 3. Deduplicate by name and keep the best offer for each hotel.
  const offers: HotelOffer[] = await localActivities.selectBestOffers({ results: succeeded });

  // 4. The deduplicated list is always written to Redis.
  await localActivities.cacheOffers({ city, offers });

  const hasPriceFilter = minPrice !== undefined || maxPrice !== undefined;
  let finalOffers = offers;
  let cacheHit = false;

  // 5. When a price range is requested, Redis does the filtering.
  if (hasPriceFilter) {
    const filtered = await localActivities.queryCachedOffers({ city, minPrice, maxPrice });
    finalOffers = filtered.offers;
    cacheHit = filtered.cacheHit;
  }

  const result: HotelSearchResult = {
    city,
    offers: finalOffers,
    source: hasPriceFilter ? 'redis' : 'suppliers',
    suppliersSucceeded: succeeded.map((entry) => entry.supplier),
    suppliersFailed: failed,
    totalBeforeFilter: offers.length,
    cacheHit,
  };

  log.info('Hotel offer search completed', {
    city,
    returned: finalOffers.length,
    totalBeforeFilter: offers.length,
    suppliersFailed: failed.length,
  });

  return result;
}

/**
 * Activity rejections arrive wrapped as ActivityFailure -> ApplicationFailure.
 * Unwrap to the innermost message; string-only so the workflow stays deterministic.
 */
function describeFailure(reason: unknown): string {
  if (reason instanceof Error) {
    let current: Error = reason;
    while (current.cause instanceof Error) {
      current = current.cause;
    }
    return current.message || current.name;
  }
  return String(reason);
}
