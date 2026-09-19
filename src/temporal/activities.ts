import { Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import { selectBestOffers as pickBestOffers } from '../domain/selectBestOffers';
import { errorInfo, logger } from '../logger';
import { filterOffersByPrice, saveOffers } from '../redis/hotelCache';
import {
  SupplierPermanentError,
  fetchSupplierHotels,
} from '../suppliers/supplierClient';
import type {
  HotelOffer,
  SupplierFetchResult,
  SupplierId,
} from '../domain/types';

/**
 * Activities are where all the side effects live: HTTP calls to the suppliers
 * and reads/writes against Redis. Everything here can be retried by Temporal,
 * so each one is safe to run more than once.
 */
const log = logger.child({ component: 'activity' });

/** Adds Temporal context to log lines when running inside a worker. */
function activityContext(): Record<string, unknown> {
  try {
    const info = Context.current().info;
    return {
      activity: info.activityType,
      attempt: info.attempt,
      workflowId: info.workflowExecution?.workflowId,
      runId: info.workflowExecution?.runId,
    };
  } catch {
    return {};
  }
}

export async function fetchSupplierOffers(input: {
  supplier: SupplierId;
  city: string;
}): Promise<SupplierFetchResult> {
  const { supplier, city } = input;
  const context = activityContext();

  try {
    const { hotels, latencyMs } = await fetchSupplierHotels(supplier, city);
    log.info({ ...context, supplier, city, hotels: hotels.length, latencyMs }, 'Supplier feed retrieved');
    return { supplier, hotels, latencyMs };
  } catch (error) {
    const permanent = error instanceof SupplierPermanentError;
    log.error(
      { ...context, supplier, city, permanent, ...errorInfo(error) },
      'Supplier feed failed',
    );

    // Tag the failure so the workflow's retry policy can tell the two apart.
    throw ApplicationFailure.create({
      type: permanent ? 'SupplierPermanentError' : 'SupplierTransientError',
      message: error instanceof Error ? error.message : String(error),
      nonRetryable: permanent,
      details: [{ supplier, city }],
    });
  }
}

export async function selectBestOffers(input: {
  results: SupplierFetchResult[];
}): Promise<HotelOffer[]> {
  const offers = pickBestOffers(input.results);
  const received = input.results.reduce((total, result) => total + result.hotels.length, 0);

  log.info(
    {
      ...activityContext(),
      received,
      deduplicated: offers.length,
      collapsed: received - offers.length,
    },
    'Selected best offer per hotel',
  );

  return offers;
}

export async function cacheOffers(input: {
  city: string;
  offers: HotelOffer[];
}): Promise<{ city: string; count: number; cachedAt: string }> {
  const meta = await saveOffers(input.city, input.offers);
  log.info({ ...activityContext(), city: meta.city, count: meta.count }, 'Offers cached in Redis');
  return meta;
}

export async function queryCachedOffers(input: {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}): Promise<{ offers: HotelOffer[]; cacheHit: boolean }> {
  const result = await filterOffersByPrice(input.city, input.minPrice, input.maxPrice);

  log.info(
    {
      ...activityContext(),
      city: input.city,
      minPrice: input.minPrice ?? null,
      maxPrice: input.maxPrice ?? null,
      matched: result.offers.length,
      cacheHit: result.cacheHit,
    },
    'Applied price filter in Redis',
  );

  if (!result.cacheHit) {
    // The workflow writes the cache immediately before this runs, so a miss
    // means the key expired or was evicted; retrying will not help.
    throw ApplicationFailure.create({
      type: 'CacheMiss',
      message: `No cached offers found for city "${input.city}"`,
      nonRetryable: true,
    });
  }

  return result;
}
