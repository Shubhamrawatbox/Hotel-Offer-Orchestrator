import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchSupplierFeed, isAbortError, searchHotels } from '../api/client';
import type { HotelOffer, SearchMeta, SearchParams, SupplierFeed, SupplierId } from '../api/types';
import {
  buildComparison,
  summarize,
  type ComparisonRow,
  type ComparisonSummary,
} from '../lib/comparison';

export interface SearchResult {
  params: SearchParams;
  offers: HotelOffer[];
  meta: SearchMeta;
  feeds: Record<SupplierId, SupplierFeed>;
  rows: ComparisonRow[];
  summary: ComparisonSummary;
}

export interface SearchRequest {
  params: SearchParams;
  /** Bumped on every run, so repeating the same search still triggers a new one. */
  id: number;
  startedAt: number;
}

export interface HotelSearch {
  request: SearchRequest | null;
  /** The last successful result. Kept while a newer search is in flight. */
  result: SearchResult | null;
  error: ApiError | null;
  pending: boolean;
  run: (params: SearchParams) => void;
}

/**
 * Runs the orchestrated search and, in parallel, reads both raw supplier feeds
 * so the UI can show what each supplier quoted. Starting a new search aborts the
 * one in flight.
 */
export function useHotelSearch(initialParams: SearchParams | null): HotelSearch {
  const [request, setRequest] = useState<SearchRequest | null>(() =>
    initialParams ? { params: initialParams, id: 1, startedAt: Date.now() } : null,
  );
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(initialParams !== null);

  useEffect(() => {
    if (!request) return;

    const controller = new AbortController();
    const { params } = request;

    Promise.all([
      searchHotels(params, controller.signal),
      fetchSupplierFeed('A', params.city, controller.signal),
      fetchSupplierFeed('B', params.city, controller.signal),
    ])
      .then(([search, feedA, feedB]) => {
        const feeds = { A: feedA, B: feedB };
        const rows = buildComparison(search.offers, feeds);
        setResult({
          params,
          offers: search.offers,
          meta: search.meta,
          feeds,
          rows,
          summary: summarize(rows),
        });
        setPending(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbortError(reason)) return;
        setError(
          reason instanceof ApiError
            ? reason
            : new ApiError({
                status: 0,
                code: 'UNEXPECTED_ERROR',
                message: reason instanceof Error ? reason.message : String(reason),
              }),
        );
        // The previous result belongs to a different search; do not leave it on screen.
        setResult(null);
        setPending(false);
      });

    return () => controller.abort();
  }, [request]);

  const run = useCallback((params: SearchParams) => {
    setError(null);
    setPending(true);
    setRequest((previous) => ({ params, id: (previous?.id ?? 0) + 1, startedAt: Date.now() }));
  }, []);

  return { request, result, error, pending, run };
}
