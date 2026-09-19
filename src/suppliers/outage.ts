import { config } from '../config';
import { errorInfo, logger } from '../logger';
import { getRedis } from '../redis/client';
import type { SupplierId } from '../domain/types';

/**
 * Lets a supplier be flipped "down" at runtime so the Postman collection can
 * exercise the partial-failure path without restarting anything.
 *
 * State lives in Redis so the API process and the Temporal worker (separate
 * containers) agree on it. If Redis is unreachable we fall back to the boot-time
 * env flags rather than failing the request.
 */
const log = logger.child({ component: 'supplier-outage' });

const OUTAGE_KEY = (supplier: SupplierId) => `supplier:${supplier}:outage`;

const ENV_DEFAULTS: Record<SupplierId, boolean> = {
  A: config.SUPPLIER_A_DOWN,
  B: config.SUPPLIER_B_DOWN,
};

export async function isSupplierDown(supplier: SupplierId): Promise<boolean> {
  try {
    const flag = await getRedis().get(OUTAGE_KEY(supplier));
    if (flag === '1') return true;
    if (flag === '0') return false;
  } catch (error) {
    log.warn({ supplier, ...errorInfo(error) }, 'Could not read outage flag, using env default');
  }
  return ENV_DEFAULTS[supplier];
}

export async function setSupplierDown(supplier: SupplierId, down: boolean): Promise<void> {
  await getRedis().set(OUTAGE_KEY(supplier), down ? '1' : '0');
  log.warn({ supplier, down }, 'Supplier outage flag changed');
}

export async function clearSupplierOverride(supplier: SupplierId): Promise<void> {
  await getRedis().del(OUTAGE_KEY(supplier));
  log.info({ supplier }, 'Supplier outage override cleared');
}
