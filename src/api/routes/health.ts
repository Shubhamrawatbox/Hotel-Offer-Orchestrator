import { Router } from 'express';
import { config } from '../../config';
import { pingRedis } from '../../redis/client';
import { probeSupplier, supplierUrl } from '../../suppliers/supplierClient';
import { pingTemporal } from '../../temporal/client';
import { asyncHandler } from '../middleware';

export const healthRouter: Router = Router();

interface Check {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
  [key: string]: unknown;
}

/** Liveness: is this process running? Deliberately dependency-free. */
healthRouter.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

/** Readiness: can this instance serve traffic? Suppliers are not required. */
healthRouter.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    const [redis, temporal] = await Promise.all([pingRedis(), pingTemporal()]);
    const ready = redis.ok && temporal.ok;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: { redis: toCheck(redis), temporal: toCheck(temporal) },
    });
  }),
);

/**
 * Full health report, including both suppliers.
 *
 *  ok       everything reachable
 *  degraded one supplier is down — results will be partial but still served
 *  down     Redis or Temporal is unreachable, or no supplier is reachable
 */
healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const startedAt = Date.now();
    const [redis, temporal, supplierA, supplierB] = await Promise.all([
      pingRedis(),
      pingTemporal(),
      probeSupplier('A'),
      probeSupplier('B'),
    ]);

    const coreUp = redis.ok && temporal.ok;
    const suppliersUp = [supplierA.ok, supplierB.ok].filter(Boolean).length;

    const status = !coreUp || suppliersUp === 0 ? 'down' : suppliersUp === 2 ? 'ok' : 'degraded';

    res.status(status === 'down' ? 503 : 200).json({
      status,
      service: 'hotel-offer-orchestrator',
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      checks: {
        redis: toCheck(redis, { url: config.REDIS_URL }),
        temporal: toCheck(temporal, {
          address: config.TEMPORAL_ADDRESS,
          namespace: config.TEMPORAL_NAMESPACE,
          taskQueue: config.TEMPORAL_TASK_QUEUE,
        }),
        supplierA: toCheck(supplierA, { url: supplierUrl('A') }),
        supplierB: toCheck(supplierB, { url: supplierUrl('B') }),
      },
    });
  }),
);

function toCheck(
  result: { ok: boolean; latencyMs: number; error?: string },
  extra: Record<string, unknown> = {},
): Check {
  return {
    status: result.ok ? 'up' : 'down',
    latencyMs: result.latencyMs,
    ...(result.error ? { error: result.error } : {}),
    ...extra,
  };
}
