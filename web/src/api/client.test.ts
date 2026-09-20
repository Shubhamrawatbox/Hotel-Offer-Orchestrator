import { describe, expect, it } from 'vitest';
import { readSearchMeta, toApiError } from './client';

describe('toApiError', () => {
  it('reads the API error envelope', () => {
    const error = toApiError(
      504,
      'Gateway Timeout',
      JSON.stringify({
        error: {
          code: 'ORCHESTRATION_TIMEOUT',
          message: 'The hotel search did not complete within 60000ms.',
          requestId: 'abc-123',
        },
      }),
    );

    expect(error).toMatchObject({
      status: 504,
      code: 'ORCHESTRATION_TIMEOUT',
      message: 'The hotel search did not complete within 60000ms.',
      requestId: 'abc-123',
    });
  });

  it('keeps field-level validation details', () => {
    const error = toApiError(
      400,
      'Bad Request',
      JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: [{ field: 'city', message: 'city is required' }],
        },
      }),
    );

    expect(error.details).toEqual([{ field: 'city', message: 'city is required' }]);
  });

  it('treats a non-JSON 5xx as the API being unreachable behind the proxy', () => {
    // Vite answers an empty 500 and nginx an HTML 502 when the API is down.
    expect(toApiError(500, 'Internal Server Error', '').code).toBe('API_UNREACHABLE');
    expect(toApiError(502, 'Bad Gateway', '<html>502</html>').code).toBe('API_UNREACHABLE');
  });

  it('distinguishes a proxy timeout from the API reporting one', () => {
    expect(toApiError(504, 'Gateway Timeout', '<html>504</html>').code).toBe('GATEWAY_TIMEOUT');
  });

  it('falls back to the status code for anything else', () => {
    expect(toApiError(418, "I'm a teapot", 'nope').code).toBe('HTTP_418');
  });
});

describe('readSearchMeta', () => {
  it('reads the run metadata from response headers', () => {
    const headers = new Headers({
      'x-request-id': 'req-1',
      'x-workflow-id': 'hotel-offers:delhi:req-1',
      'x-run-id': 'run-1',
      'x-offers-source': 'redis',
      'x-total-before-filter': '7',
      'x-suppliers-succeeded': 'B',
      'x-suppliers-failed': 'A',
      'x-degraded': 'true',
    });

    expect(readSearchMeta(headers, 312.4)).toEqual({
      requestId: 'req-1',
      workflowId: 'hotel-offers:delhi:req-1',
      runId: 'run-1',
      source: 'redis',
      totalBeforeFilter: 7,
      suppliersSucceeded: ['B'],
      suppliersFailed: ['A'],
      degraded: true,
      durationMs: 312,
    });
  });

  it('defaults sensibly when headers are missing', () => {
    expect(readSearchMeta(new Headers({ 'x-suppliers-succeeded': 'none' }), 10)).toMatchObject({
      source: 'suppliers',
      totalBeforeFilter: undefined,
      suppliersSucceeded: [],
      suppliersFailed: [],
      degraded: false,
    });
  });
});
