import { config } from '../config';

export const TASK_QUEUE = config.TEMPORAL_TASK_QUEUE;

export const HOTEL_OFFER_WORKFLOW = 'hotelOfferWorkflow';

/** Workflow ids are human-readable so a request can be traced straight to the Temporal UI. */
export function buildWorkflowId(city: string, requestId: string): string {
  return `hotel-offers:${city}:${requestId}`;
}
