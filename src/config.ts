import { z } from 'zod';

/**
 * Environment parsing lives in one place so that a bad value fails loudly at
 * boot instead of surfacing as a confusing runtime error inside an activity.
 */

/** `z.coerce.boolean()` treats the string "false" as true, so parse flags explicitly. */
const envBool = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: envBool(false),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  TEMPORAL_ADDRESS: z.string().min(1).default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default('hotel-offers'),
  TEMPORAL_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WORKFLOW_EXECUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  /** The worker calls the mock suppliers over HTTP, exactly as it would call a real one. */
  SUPPLIER_A_URL: z.string().url().default('http://localhost:3000/supplierA/hotels'),
  SUPPLIER_B_URL: z.string().url().default('http://localhost:3000/supplierB/hotels'),
  SUPPLIER_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),

  /** Knobs used to make the mock suppliers behave like flaky real ones. */
  SUPPLIER_A_DOWN: envBool(false),
  SUPPLIER_B_DOWN: envBool(false),
  SUPPLIER_A_LATENCY_MS: z.coerce.number().int().nonnegative().default(0),
  SUPPLIER_B_LATENCY_MS: z.coerce.number().int().nonnegative().default(0),
  /** 0 keeps mock prices stable so API tests can assert on exact values. */
  SUPPLIER_PRICE_JITTER_PCT: z.coerce.number().min(0).max(50).default(0),

  WORKER_MAX_CONCURRENT_ACTIVITIES: z.coerce.number().int().positive().default(50),
});

export type AppConfig = z.infer<typeof EnvSchema>;

function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config = loadConfig();

export const isProduction = config.NODE_ENV === 'production';
