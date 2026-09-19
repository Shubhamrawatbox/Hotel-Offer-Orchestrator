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
