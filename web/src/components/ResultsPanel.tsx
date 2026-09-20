import type { ReactNode } from 'react';
import type { SearchMeta, SearchParams } from '../api/types';
import type { HotelSearch, SearchResult } from '../hooks/useHotelSearch';
import { useNow } from '../hooks/useNow';
import { formatCity, formatDuration, formatPrice, pluralize } from '../lib/format';
import { workflowUrl } from '../lib/temporal';
import { hasPriceFilter } from '../lib/validation';
import { ErrorPanel } from './ErrorPanel';
import { AlertIcon, BoltIcon, DatabaseIcon, ExternalIcon } from './Icons';
import { OffersTable } from './OffersTable';
import { StatTiles } from './StatTiles';

interface ResultsPanelProps {
  search: HotelSearch;
  namespace: string;
  onClearFilter: (params: SearchParams) => void;
  onRetry: () => void;
}

/** Past this, a search that is still running is probably waiting on a missing worker. */
const SLOW_SEARCH_MS = 10_000;

export function ResultsPanel({ search, namespace, onClearFilter, onRetry }: ResultsPanelProps) {
  const { request, result, error, pending } = search;
  const now = useNow(100, pending);
  const elapsed = request && pending ? Math.max(0, now - request.startedAt) : 0;
  const refreshing = pending && result !== null;

  console.log('search',search)

  let title: string;
  let body: ReactNode;

  if (!request) {
    title = 'Results';
    body = <Intro />;
  } else if (error && !pending) {
    title = `Search failed for ${formatCity(request.params.city)}`;
    body = <ErrorPanel error={error} onRetry={onRetry} />;
  } else if (!result) {
    title = `Searching ${formatCity(request.params.city)}…`;
    body = <Loading elapsed={elapsed} />;
  } else {
    title = resultTitle(result);
    body = <ResultBody result={result} namespace={namespace} onClearFilter={onClearFilter} />;
  }

  return (
    <section className="card results-card" aria-labelledby="results-title" aria-busy={pending}>
      {pending && <div className="progress" aria-hidden="true" />}

      <div className="results-header">
        <h2 id="results-title">{title}</h2>
        {refreshing && (
          <span className="updating">
            Updating · <span className="tabular">{formatDuration(elapsed)}</span>
          </span>
        )}
      </div>

      {/* Hold the previous results, dimmed, while a new search runs — no layout jump. */}
      <div className={refreshing ? 'results-body is-stale' : 'results-body'}>{body}</div>

      {refreshing && elapsed > SLOW_SEARCH_MS && <SlowSearchHint />}

      <p className="sr-only" aria-live="polite">
        {!pending && result ? title : ''}
      </p>
    </section>
  );
}

function resultTitle(result: SearchResult): string {
  const { params, offers } = result;
  const base = `${pluralize(offers.length, 'hotel')} in ${formatCity(params.city)}`;
  return hasPriceFilter(params) ? `${base}, ${formatRange(params)}` : base;
}

function formatRange({ minPrice, maxPrice }: SearchParams): string {
  if (minPrice !== undefined && maxPrice !== undefined) {
    return `${formatPrice(minPrice)}–${formatPrice(maxPrice)}`;
  }
  if (minPrice !== undefined) return `from ${formatPrice(minPrice)}`;
  if (maxPrice !== undefined) return `up to ${formatPrice(maxPrice)}`;
  return 'any price';
}

function ResultBody({
  result,
  namespace,
  onClearFilter,
}: {
  result: SearchResult;
  namespace: string;
  onClearFilter: (params: SearchParams) => void;
}) {
  const { params, offers, meta, rows } = result;

  return (
    <>
      <RunMeta meta={meta} namespace={namespace} />
      {meta.degraded && <DegradedBanner meta={meta} />}

      {offers.length > 0 ? (
        <>
          <StatTiles result={result} />
          <OffersTable rows={rows} city={params.city} />
        </>
      ) : (
        <EmptyResult result={result} onClearFilter={onClearFilter} />
      )}
    </>
  );
}

function RunMeta({ meta, namespace }: { meta: SearchMeta; namespace: string }) {
  const answered = meta.suppliersSucceeded.map((id) => `Supplier ${id}`).join(' and ');

  return (
    <div className="run-meta">
      {meta.source === 'redis' ? (
        <span className="source-badge">
          <DatabaseIcon />
          Filtered by price in Redis
        </span>
      ) : (
        <span className="source-badge">
          <BoltIcon />
          Fresh from {meta.degraded ? answered || 'suppliers' : 'both suppliers'}
        </span>
      )}

      {meta.workflowId && (
        <a
          className="text-link"
          href={workflowUrl(meta.workflowId, meta.runId, namespace)}
          target="_blank"
          rel="noreferrer"
        >
          View workflow
          <ExternalIcon />
        </a>
      )}

      {meta.requestId && (
        <span className="run-meta-id" title="Request id">
          {meta.requestId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}

function DegradedBanner({ meta }: { meta: SearchMeta }) {
  const failed = meta.suppliersFailed.map((id) => `Supplier ${id}`).join(' and ');
  const answered = meta.suppliersSucceeded.map((id) => `Supplier ${id}`).join(' and ');

  return (
    <div className="banner banner--warning" role="status">
      <span className="banner-icon">
        <AlertIcon />
      </span>
      <p>
        <strong>Partial results.</strong> {failed || 'A supplier'} didn&apos;t respond, so these
        offers come from {answered || 'the remaining supplier'} only.
      </p>
    </div>
  );
}

function EmptyResult({
  result,
  onClearFilter,
}: {
  result: SearchResult;
  onClearFilter: (params: SearchParams) => void;
}) {
  const { params, meta } = result;
  const total = meta.totalBeforeFilter ?? 0;
  const city = formatCity(params.city);

  if (hasPriceFilter(params) && total > 0) {
    return (
      <div className="empty-state">
        <h3>No hotels in this price range</h3>
        <p>
          All {pluralize(total, 'hotel')} in {city} are priced outside {formatRange(params)}.
        </p>
        <button type="button" className="button button--ghost" onClick={() => onClearFilter(params)}>
          Clear price filter
        </button>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <h3>No hotels in {city}</h3>
      <p>Neither supplier sells hotels here. Try Delhi, Mumbai or Goa.</p>
    </div>
  );
}

function Intro() {
  return (
    <div className="intro">
      <p>Pick a city to see the best offer for every hotel. Each search runs a Temporal workflow that:</p>
      <ol className="steps">
        <li>
          <strong>Calls both suppliers in parallel.</strong> Supplier A and Supplier B each return
          their hotels for the city.
        </li>
        <li>
          <strong>Deduplicates by hotel name.</strong> When both sell the same hotel, the cheaper
          offer wins.
        </li>
        <li>
          <strong>Caches the list in Redis.</strong> A price range is applied there, not in the
          browser.
        </li>
      </ol>
    </div>
  );
}

function Loading({ elapsed }: { elapsed: number }) {
  return (
    <div className="loading">
      <p className="loading-status">
        Running the workflow… <span className="tabular">{formatDuration(elapsed)}</span>
      </p>
      <div className="skeleton" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="skeleton-row">
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
      {elapsed > SLOW_SEARCH_MS && <SlowSearchHint />}
    </div>
  );
}

function SlowSearchHint() {
  return (
    <p className="slow-hint">
      Still waiting. A search that never finishes usually means no Temporal worker is running — check
      the worker in System health. The API gives up after 60 s.
    </p>
  );
}
