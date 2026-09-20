import { Client, Connection } from '@temporalio/client';
import { config } from '../config';
import { errorInfo, logger } from '../logger';

const log = logger.child({ component: 'temporal-client' });

let connection: Connection | undefined;
let clientPromise: Promise<Client> | undefined;

/**
 * Lazily connects to Temporal and memoises the client. A failed attempt clears
 * the memo so the next request retries rather than being stuck with a rejected
 * promise — useful when the API boots before the Temporal server is ready.
 */
export function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

async function connect(): Promise<Client> {
  log.info({ address: config.TEMPORAL_ADDRESS, namespace: config.TEMPORAL_NAMESPACE }, 'Connecting to Temporal');

  connection = await Connection.connect({
    address: config.TEMPORAL_ADDRESS,
    connectTimeout: config.TEMPORAL_CONNECT_TIMEOUT_MS,
  });

  const client = new Client({ connection, namespace: config.TEMPORAL_NAMESPACE });
  log.info('Connected to Temporal');
  return client;
}

export async function pingTemporal(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  try {
    const client = await getTemporalClient();
    await client.connection.workflowService.getSystemInfo({ namespace: config.TEMPORAL_NAMESPACE });
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Temporal keeps reporting a poller for a while after the worker behind it has
 * gone, so a poller only counts as live if it has polled recently. Workers
 * long-poll on a 60s cycle; 120s leaves headroom without hiding a dead worker
 * for long.
 */
const POLLER_STALE_AFTER_MS = 120_000;

/**
 * Asks Temporal who is polling our task queue. Zero live pollers means a request
 * would be accepted and then sit there until it times out, so /health treats it
 * as an outage rather than waiting for a caller to discover it the hard way.
 */
export async function checkWorkers(): Promise<{
  ok: boolean;
  latencyMs: number;
  pollers?: number;
  error?: string;
}> {
  const startedAt = Date.now();
  try {
    const client = await getTemporalClient();
    const response = await client.connection.workflowService.describeTaskQueue({
      namespace: config.TEMPORAL_NAMESPACE,
      taskQueue: { name: config.TEMPORAL_TASK_QUEUE },
      // temporal.api.enums.v1.TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW
      taskQueueType: 1,
    });

    const now = Date.now();
    const pollers = (response.pollers ?? []).filter((poller) => {
      const lastAccess = toMillis(poller.lastAccessTime);
      return lastAccess === undefined || now - lastAccess <= POLLER_STALE_AFTER_MS;
    }).length;

    return {
      ok: pollers > 0,
      latencyMs: Date.now() - startedAt,
      pollers,
      ...(pollers === 0
        ? { error: `No worker is polling the "${config.TEMPORAL_TASK_QUEUE}" task queue` }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** protobuf Timestamps arrive as { seconds: string | number | Long, nanos }. */
function toMillis(timestamp: { seconds?: unknown; nanos?: number | null } | null | undefined):
  | number
  | undefined {
  if (!timestamp || timestamp.seconds === undefined || timestamp.seconds === null) return undefined;
  const seconds = Number(timestamp.seconds);
  if (!Number.isFinite(seconds)) return undefined;
  return seconds * 1_000 + (timestamp.nanos ?? 0) / 1_000_000;
}

export async function closeTemporalClient(): Promise<void> {
  const active = connection;
  connection = undefined;
  clientPromise = undefined;
  if (!active) return;
  try {
    await active.close();
  } catch (error) {
    log.warn(errorInfo(error), 'Error while closing the Temporal connection');
  }
}
