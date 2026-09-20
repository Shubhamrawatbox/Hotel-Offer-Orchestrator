import type { ReactNode } from 'react';
import type { ApiError } from '../api/client';
import { CrossIcon, RefreshIcon } from './Icons';

interface Guidance {
  title: string;
  hint?: ReactNode;
}

/** Turns each failure the API can report into a plain-language next step. */
const GUIDANCE: Record<string, Guidance> = {
  ORCHESTRATION_TIMEOUT: {
    title: 'The workflow never finished',
    hint: (
      <>
        No Temporal worker picked up the job. Start one with <code>npm run dev:worker</code> (or{' '}
        <code>docker compose up -d worker</code>) and retry.
      </>
    ),
  },
  ALL_SUPPLIERS_UNAVAILABLE: {
    title: 'Both suppliers are down',
    hint: 'Bring at least one supplier back online in the outage simulator, then retry.',
  },
  ORCHESTRATOR_UNAVAILABLE: {
    title: 'Temporal is unreachable',
    hint: (
      <>
        Check that the Temporal server is running: <code>docker compose ps temporal</code>.
      </>
    ),
  },
  CACHE_UNAVAILABLE: {
    title: 'Redis lost the cached results',
    hint: 'Retry the search — the workflow rebuilds the cache on every run.',
  },
  VALIDATION_ERROR: {
    title: 'The API rejected the search',
  },
  API_UNREACHABLE: {
    title: 'The API is not responding',
    hint: (
      <>
        Start the backend with <code>npm run dev:api</code> and <code>npm run dev:worker</code>, or
        run <code>docker compose up</code>.
      </>
    ),
  },
  NETWORK_ERROR: {
    title: 'Could not reach the API',
    hint: 'Check your connection and that the backend is running.',
  },
  GATEWAY_TIMEOUT: {
    title: 'The request timed out',
    hint: 'The API did not answer in time. Check that the worker is running, then retry.',
  },
};

export function ErrorPanel({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const guidance = GUIDANCE[error.code] ?? { title: 'The search failed' };

  return (
    <div className="error-panel" role="alert">
      <span className="error-panel-icon">
        <CrossIcon />
      </span>
      <div className="error-panel-body">
        <h3>{guidance.title}</h3>
        <p>{error.message}</p>

        {error.details && error.details.length > 0 && (
          <ul className="error-details">
            {error.details.map((detail) => (
              <li key={`${detail.field}:${detail.message}`}>
                <code>{detail.field}</code> {detail.message}
              </li>
            ))}
          </ul>
        )}

        {guidance.hint && <p className="error-hint">{guidance.hint}</p>}

        <p className="error-meta">
          <code>{error.code}</code>
          {error.status > 0 && <> · HTTP {error.status}</>}
          {error.requestId && (
            <>
              {' '}
              · request <code>{error.requestId}</code>
            </>
          )}
        </p>

        {onRetry && (
          <button type="button" className="button button--ghost" onClick={onRetry}>
            <RefreshIcon />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
