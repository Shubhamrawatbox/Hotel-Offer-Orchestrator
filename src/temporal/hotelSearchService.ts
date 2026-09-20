import { WorkflowFailedError } from '@temporalio/client';
import { ApplicationFailure, TimeoutFailure } from '@temporalio/common';
import { config } from '../config';
import { AppError } from '../api/errors';
import { errorInfo, logger } from '../logger';
import { getTemporalClient } from './client';
import { HOTEL_OFFER_WORKFLOW, TASK_QUEUE, buildWorkflowId } from './shared';
import type { HotelSearchInput, HotelSearchResult } from '../domain/types';
import type { hotelOfferWorkflow } from './workflows';

const log = logger.child({ component: 'hotel-search-service' });

export interface HotelSearchOutcome extends HotelSearchResult {
  workflowId: string;
  runId: string;
  durationMs: number;
}

/**
 * Starts the orchestration workflow and waits for its result. The HTTP layer
 * stays free of Temporal specifics — everything is translated into an AppError
 * with a sensible status code before it leaves this module.
 */
export async function runHotelSearch(input: HotelSearchInput): Promise<HotelSearchOutcome> {
  const workflowId = buildWorkflowId(input.city, input.requestId);
  const startedAt = Date.now();

  let client;
  try {
    client = await getTemporalClient();
  } catch (error) {
    log.error(errorInfo(error), 'Temporal is unreachable');
    throw new AppError(503, 'ORCHESTRATOR_UNAVAILABLE', 'The orchestration service is currently unavailable', {
      cause: error,
    });
  }

  try {
    const handle = await client.workflow.start<typeof hotelOfferWorkflow>(HOTEL_OFFER_WORKFLOW, {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [input],
      workflowExecutionTimeout: config.WORKFLOW_EXECUTION_TIMEOUT_MS,
      workflowTaskTimeout: '10 seconds',
    });

    log.info({ workflowId, runId: handle.firstExecutionRunId, city: input.city }, 'Workflow started');

    const result = await handle.result();
    const durationMs = Date.now() - startedAt;

    log.info(
      {
        workflowId,
        city: input.city,
        offers: result.offers.length,
        source: result.source,
        suppliersFailed: result.suppliersFailed.length,
        durationMs,
      },
      'Workflow completed',
    );

    return { ...result, workflowId, runId: handle.firstExecutionRunId, durationMs };
  } catch (error) {
    throw translateWorkflowError(error, workflowId, input);
  }
}

function translateWorkflowError(error: unknown, workflowId: string, input: HotelSearchInput): AppError {
  if (error instanceof WorkflowFailedError) {
    const cause = error.cause;
    const failureType = cause instanceof ApplicationFailure ? cause.type : undefined;
    const message = cause instanceof Error ? cause.message : error.message;

    log.error({ workflowId, city: input.city, failureType, message }, 'Workflow failed');

    // A workflow that never completes is almost always a workflow nothing picked
    // up: the API started it, but no worker is polling the task queue. Say that,
    // rather than reporting a generic failure.
    if (isTimeout(error)) {
      return new AppError(
        504,
        'ORCHESTRATION_TIMEOUT',
        `The hotel search did not complete within ${config.WORKFLOW_EXECUTION_TIMEOUT_MS}ms. ` +
          `This usually means no Temporal worker is polling the "${TASK_QUEUE}" task queue — ` +
          `check that the worker process is running (docker compose ps worker).`,
        { cause: error },
      );
    }

    switch (failureType) {
      case 'AllSuppliersUnavailable':
        return new AppError(502, 'ALL_SUPPLIERS_UNAVAILABLE', message, { cause: error });
      case 'CacheMiss':
        return new AppError(503, 'CACHE_UNAVAILABLE', message, { cause: error });
      default:
        return new AppError(500, 'WORKFLOW_FAILED', message || 'The hotel search workflow failed', {
          cause: error,
        });
    }
  }

  log.error({ workflowId, city: input.city, ...errorInfo(error) }, 'Unexpected orchestration error');
  return new AppError(503, 'ORCHESTRATOR_UNAVAILABLE', 'The orchestration service is currently unavailable', {
    cause: error,
  });
}

/**
 * An execution timeout arrives as a WorkflowFailedError with no cause and the
 * message "Workflow execution timed out"; activity-level timeouts arrive as a
 * TimeoutFailure cause. Both mean the same thing to the caller.
 */
function isTimeout(error: WorkflowFailedError): boolean {
  return error.cause instanceof TimeoutFailure || /timed out/i.test(error.message);
}
