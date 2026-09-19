import type { Server } from 'node:http';
import { config } from '../config';
import { errorInfo, logger } from '../logger';
import { closeRedis, getRedis } from '../redis/client';
import { closeTemporalClient, getTemporalClient } from '../temporal/client';
import { createApp } from './app';

const log = logger.child({ component: 'server' });

function start(): Server {
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    log.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        temporal: config.TEMPORAL_ADDRESS,
        taskQueue: config.TEMPORAL_TASK_QUEUE,
        redis: config.REDIS_URL,
      },
      'API listening',
    );
  });

  // Open the Redis connection eagerly, and warm the Temporal one in the
  // background so the first request is not the one paying for the handshake.
  getRedis();
  void getTemporalClient().catch((error) =>
    log.warn(errorInfo(error), 'Temporal not reachable at startup, will retry on first request'),
  );

  registerShutdown(server);
  return server;
}

function registerShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'Shutting down');

    const forced = setTimeout(() => {
      log.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forced.unref();

    server.close(async () => {
      await closeTemporalClient();
      await closeRedis();
      log.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    log.error(errorInfo(reason), 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    log.fatal(errorInfo(error), 'Uncaught exception, exiting');
    process.exit(1);
  });
}

start();
