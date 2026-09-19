import { DefaultLogger, NativeConnection, Runtime, Worker, type LogEntry } from '@temporalio/worker';
import { config } from '../config';
import { errorInfo, logger } from '../logger';
import { closeRedis } from '../redis/client';
import * as activities from './activities';
import { TASK_QUEUE } from './shared';

const log = logger.child({ component: 'worker' });

/**
 * Route the SDK's own logs (including `log.*` calls made inside workflows and
 * activities) through pino, so worker output is structured like everything else.
 * Must run before anything else touches the Temporal runtime.
 */
Runtime.install({
  logger: new DefaultLogger('INFO', (entry: LogEntry) => {
    const level = entry.level.toLowerCase();
    const emit =
      level === 'trace' || level === 'debug' || level === 'warn' || level === 'error'
        ? logger[level].bind(logger)
        : logger.info.bind(logger);
    emit({ temporal: true, ...entry.meta }, entry.message);
  }),
});

/**
 * Temporal usually takes a while to finish its own schema setup, so the worker
 * keeps retrying instead of crash-looping on startup.
 */
async function connectWithRetry(attempts = 30, delayMs = 2_000): Promise<NativeConnection> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
    } catch (error) {
      if (attempt === attempts) throw error;
      log.warn(
        { attempt, attempts, address: config.TEMPORAL_ADDRESS, ...errorInfo(error) },
        'Temporal not reachable yet, retrying',
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<void> {
  const connection = await connectWithRetry();

  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows'),
    activities,
    maxConcurrentActivityTaskExecutions: config.WORKER_MAX_CONCURRENT_ACTIVITIES,
  });

  log.info(
    {
      taskQueue: TASK_QUEUE,
      namespace: config.TEMPORAL_NAMESPACE,
      address: config.TEMPORAL_ADDRESS,
      activities: Object.keys(activities),
    },
    'Worker started and polling',
  );

  try {
    // Worker.run() resolves once SIGINT/SIGTERM triggers its built-in shutdown.
    await worker.run();
    log.info('Worker shut down cleanly');
  } finally {
    await connection.close().catch((error) => log.warn(errorInfo(error), 'Error closing Temporal connection'));
    await closeRedis();
  }
}

main().catch((error) => {
  log.fatal(errorInfo(error), 'Worker terminated');
  process.exit(1);
});
