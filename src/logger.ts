import pino, { type LoggerOptions } from 'pino';
import { config } from './config';

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: { service: 'hotel-offer-orchestrator' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
};

/**
 * pino-pretty is a dev dependency, so only reach for it when explicitly asked
 * and never let a missing module take the process down.
 */
if (config.LOG_PRETTY) {
  try {
    require.resolve('pino-pretty');
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,service' },
    };
  } catch {
    // Fall through to structured JSON logging.
  }
}

export const logger = pino(options);

export type Logger = typeof logger;

/** Normalises anything thrown into something safe to log. */
export function errorInfo(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error) };
}
