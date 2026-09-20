import { TEMPORAL_UI_URL } from '../config';

/** Deep link to a workflow execution's event history in the Temporal Web UI. */
export function workflowUrl(workflowId: string, runId?: string, namespace = 'default'): string {
  const base = `${TEMPORAL_UI_URL}/namespaces/${encodeURIComponent(namespace)}/workflows/${encodeURIComponent(workflowId)}`;
  return runId ? `${base}/${encodeURIComponent(runId)}/history` : base;
}
