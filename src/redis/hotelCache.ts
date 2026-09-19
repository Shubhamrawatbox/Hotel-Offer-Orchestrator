import { config } from '../config';
import { normalizeCity, normalizeName } from '../domain/normalize';
import { logger } from '../logger';
import type { HotelOffer } from '../domain/types';
import { getRedis } from './client';

const log = logger.child({ component: 'hotel-cache' });

/**
 * Layout per city:
 *   hotels:{city}:meta   STRING  JSON metadata, also the "have we cached this city" marker
 *   hotels:{city}:index  ZSET    normalized hotel name -> price (the score)
 *   hotels:{city}:offers HASH    normalized hotel name -> offer JSON
 *
 * Keeping price in the sorted set score is what lets Redis do the range filter
 * itself via ZRANGEBYSCORE.
 */
const metaKey = (city: string) => `hotels:${city}:meta`;
const indexKey = (city: string) => `hotels:${city}:index`;
const dataKey = (city: string) => `hotels:${city}:offers`;

export interface CacheMeta {
  city: string;
  count: number;
  cachedAt: string;
}

export interface FilterResult {
  offers: HotelOffer[];
  cacheHit: boolean;
}

/**
 * Replaces the cached offers for a city. Wrapped in MULTI so readers never see
 * a half-written city, and everything expires together.
 */
export async function saveOffers(rawCity: string, offers: readonly HotelOffer[]): Promise<CacheMeta> {
  const city = normalizeCity(rawCity);
  const redis = getRedis();
  const ttl = config.CACHE_TTL_SECONDS;

  const meta: CacheMeta = { city, count: offers.length, cachedAt: new Date().toISOString() };
  const multi = redis.multi();

  multi.del(indexKey(city), dataKey(city));

  if (offers.length > 0) {
    const zaddArgs: (string | number)[] = [];
    const hsetArgs: string[] = [];
    for (const offer of offers) {
      const key = normalizeName(offer.name);
      zaddArgs.push(offer.price, key);
      hsetArgs.push(key, JSON.stringify(offer));
    }
    multi.zadd(indexKey(city), ...zaddArgs);
    multi.hset(dataKey(city), ...hsetArgs);
    multi.expire(indexKey(city), ttl);
    multi.expire(dataKey(city), ttl);
  }

  multi.set(metaKey(city), JSON.stringify(meta), 'EX', ttl);

  const replies = await multi.exec();
  const failed = replies?.find(([error]) => error);
  if (failed?.[0]) throw failed[0];

  log.debug({ city, count: offers.length, ttl }, 'Cached deduplicated offers');
  return meta;
}

/**
 * Price filtering happens inside Redis (see the Lua script in ./client). An
 * omitted bound becomes -inf / +inf, so this also serves as a plain cache read.
 */
export async function filterOffersByPrice(
  rawCity: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<FilterResult> {
  const city = normalizeCity(rawCity);
  const min = minPrice === undefined ? '-inf' : String(minPrice);
  const max = maxPrice === undefined ? '+inf' : String(maxPrice);

  const [cacheHit, rows] = await getRedis().filterOffersByPrice(
    metaKey(city),
    indexKey(city),
    dataKey(city),
    min,
    max,
  );

  const offers: HotelOffer[] = [];
  for (const row of rows) {
    try {
      offers.push(JSON.parse(row) as HotelOffer);
    } catch {
      log.warn({ city }, 'Skipping unparseable cached offer');
    }
  }

  // ZRANGEBYSCORE already returns ascending by price; keep ties stable by name.
  offers.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  return { offers, cacheHit: cacheHit === 1 };
}

export async function readMeta(rawCity: string): Promise<CacheMeta | null> {
  const raw = await getRedis().get(metaKey(normalizeCity(rawCity)));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CacheMeta;
  } catch {
    return null;
  }
}

export async function invalidateCity(rawCity: string): Promise<void> {
  const city = normalizeCity(rawCity);
  await getRedis().del(metaKey(city), indexKey(city), dataKey(city));
  log.info({ city }, 'Cache invalidated');
}
