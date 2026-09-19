import Redis, { type RedisOptions } from 'ioredis';
import { config } from '../config';
import { errorInfo, logger } from '../logger';

const log = logger.child({ component: 'redis' });

/**
 * Price filtering is done by Redis itself, not in Node. The script walks the
 * per-city sorted set (score = price) and hydrates the matching offers from the
 * companion hash, so only the rows inside the requested range ever cross the
 * wire.
 *
 * KEYS: meta, index (sorted set), data (hash)
 * ARGV: min score, max score ('-inf' / '+inf' are accepted)
 * Returns [cacheHit, offersJson[]]
 */
const FILTER_OFFERS_LUA = `
local metaKey = KEYS[1]
local indexKey = KEYS[2]
local dataKey = KEYS[3]

if redis.call('EXISTS', metaKey) == 0 then
  return {0, {}}
end

local names = redis.call('ZRANGEBYSCORE', indexKey, ARGV[1], ARGV[2])
local offers = {}
for i = 1, #names do
  local offer = redis.call('HGET', dataKey, names[i])
  if offer then
    offers[#offers + 1] = offer
  end
end

return {1, offers}
`;

export interface HotelRedis extends Redis {
  filterOffersByPrice(
    metaKey: string,
    indexKey: string,
    dataKey: string,
    min: string,
    max: string,
  ): Promise<[number, string[]]>;
}

let client: HotelRedis | undefined;

export function getRedis(): HotelRedis {
  if (client) return client;

  const options: RedisOptions = {
    // Fail a request after a few attempts instead of hanging the HTTP handler.
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 3_000),
  };

  const instance = new Redis(config.REDIS_URL, options) as HotelRedis;

  instance.defineCommand('filterOffersByPrice', { numberOfKeys: 3, lua: FILTER_OFFERS_LUA });

  instance.on('connect', () => log.info({ url: redactUrl(config.REDIS_URL) }, 'Redis connecting'));
  instance.on('ready', () => log.info('Redis ready'));
  instance.on('error', (error) => log.error(errorInfo(error), 'Redis error'));
  instance.on('end', () => log.warn('Redis connection closed'));

  client = instance;
  return client;
}

export async function pingRedis(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  try {
    const pong = await getRedis().ping();
    return { ok: pong === 'PONG', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch (error) {
    log.warn(errorInfo(error), 'Error while closing Redis, disconnecting');
    client.disconnect();
  } finally {
    client = undefined;
  }
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url;
  }
}
