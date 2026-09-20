import { toQueryString } from '../lib/url';
import type {
  ErrorDetail,
  HealthReport,
  HotelOffer,
  SearchMeta,
  SearchParams,
  SupplierFeed,
  SupplierHotel,
  SupplierId,
  SupplierOutage,
} from './types';

/**
 * Thin, typed wrapper over the backend. Every call is same-origin: the Vite dev
 * server (or nginx in Docker) forwards these paths to the API.
 */

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never got a response. */
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: ErrorDetail[];

  constructor(init: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    details?: ErrorDetail[];
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.details = init.details;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Turns a failed response into an ApiError. The API always answers with a JSON
 * envelope; anything else came from the proxy in front of it, which means the
 * API itself did not answer.
 */
export function toApiError(status: number, statusText: string, body: string): ApiError {
  const envelope = parseJson(body);
  if (isErrorEnvelope(envelope)) {
    const { code, message, requestId, details } = envelope.error;
    return new ApiError({
      status,
      code,
      message: message || statusText || `Request failed with status ${status}`,
      requestId,
      details: Array.isArray(details) ? details : undefined,
    });
  }

  if (status === 500 || status === 502 || status === 503) {
    return new ApiError({
      status,
      code: 'API_UNREACHABLE',
      message: 'The API is not responding. Make sure the backend is running.',
    });
  }
  if (status === 504) {
    return new ApiError({
      status,
      code: 'GATEWAY_TIMEOUT',
      message: 'The request timed out before the API answered.',
    });
  }
  return new ApiError({
    status,
    code: `HTTP_${status}`,
    message: `The API responded ${status}${statusText ? ` ${statusText}` : ''}.`,
  });
}

/** Reads the run metadata the API puts in response headers. */
export function readSearchMeta(headers: Headers, durationMs: number): SearchMeta {
  const list = (value: string | null): string[] =>
    value && value !== 'none'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const total = headers.get('x-total-before-filter');
  const totalBeforeFilter = total !== null && total.trim() !== '' ? Number(total) : Number.NaN;

  return {
    requestId: headers.get('x-request-id') ?? undefined,
    workflowId: headers.get('x-workflow-id') ?? undefined,
    runId: headers.get('x-run-id') ?? undefined,
    source: headers.get('x-offers-source') === 'redis' ? 'redis' : 'suppliers',
    totalBeforeFilter: Number.isFinite(totalBeforeFilter) ? totalBeforeFilter : undefined,
    suppliersSucceeded: list(headers.get('x-suppliers-succeeded')),
    suppliersFailed: list(headers.get('x-suppliers-failed')),
    degraded: headers.get('x-degraded') === 'true',
    durationMs: Math.round(durationMs),
  };
}

export async function searchHotels(
  params: SearchParams,
  signal?: AbortSignal,
): Promise<{ offers: HotelOffer[]; meta: SearchMeta }> {
  const startedAt = performance.now();
  const response = await send(`/api/hotels?${toQueryString(params)}`, { signal });
  const body = await response.text();

  if (!response.ok) throw toApiError(response.status, response.statusText, body);

  const offers = parseJson(body);
  if (!Array.isArray(offers)) {
    throw new ApiError({
      status: response.status,
      code: 'UNEXPECTED_RESPONSE',
      message: 'The API returned something other than a list of offers.',
    });
  }

  return {
    offers: offers as HotelOffer[],
    meta: readSearchMeta(response.headers, performance.now() - startedAt),
  };
}

/**
 * A supplier being down is an expected state for this UI (that is what the
 * outage simulator is for), so it is reported as data rather than thrown.
 */
export async function fetchSupplierFeed(
  supplier: SupplierId,
  city: string,
  signal?: AbortSignal,
): Promise<SupplierFeed> {
  try {
    const response = await send(`/supplier${supplier}/hotels?${new URLSearchParams({ city })}`, {
      signal,
    });
    if (!response.ok) return { status: 'unavailable', reason: `HTTP ${response.status}` };

    const hotels = parseJson(await response.text());
    return { status: 'ok', hotels: Array.isArray(hotels) ? (hotels as SupplierHotel[]) : [] };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** /health answers 503 *with a full report* when the service is down — that is data, not a failure. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  const response = await send('/health', { signal });
  const body = await response.text();
  const report = parseJson(body);

  if (isHealthReport(report)) return report;
  throw toApiError(response.status, response.statusText, body);
}

export async function fetchOutages(signal?: AbortSignal): Promise<SupplierOutage[]> {
  const response = await send('/admin/suppliers', { signal });
  const body = await response.text();
  if (!response.ok) throw toApiError(response.status, response.statusText, body);

  const parsed = parseJson(body) as { suppliers?: SupplierOutage[] } | null;
  return parsed?.suppliers ?? [];
}

export async function setSupplierOutage(supplier: SupplierId, down: boolean): Promise<void> {
  const response = await send(`/admin/suppliers/${supplier}/outage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ down }),
  });
  if (!response.ok) {
    throw toApiError(response.status, response.statusText, await response.text());
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the API. Check your connection and that the backend is running.',
    });
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function isErrorEnvelope(
  value: unknown,
): value is { error: { code: string; message?: string; requestId?: string; details?: unknown } } {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

function isHealthReport(value: unknown): value is HealthReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { status?: unknown }).status === 'string' &&
    typeof (value as { checks?: unknown }).checks === 'object'
  );
}
