import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchHealth, isAbortError } from '../api/client';
import type { HealthReport } from '../api/types';
import { HEALTH_POLL_INTERVAL_MS } from '../config';

export interface Health {
  report: HealthReport | null;
  /** Set when /health itself could not be read — usually the API is down. */
  error: ApiError | null;
  checkedAt: number | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/** Polls /health, pausing while the tab is hidden and catching up when it returns. */
export function useHealth(intervalMs = HEALTH_POLL_INTERVAL_MS): Health {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setRefreshing(true);

    try {
      setReport(await fetchHealth(controller.signal));
      setError(null);
    } catch (reason) {
      if (isAbortError(reason)) return;
      setReport(null);
      setError(
        reason instanceof ApiError
          ? reason
          : new ApiError({ status: 0, code: 'UNEXPECTED_ERROR', message: String(reason) }),
      );
    } finally {
      // A superseded or unmounted check must not overwrite the newer state.
      if (inFlight.current === controller) {
        inFlight.current = null;
        setRefreshing(false);
        setCheckedAt(Date.now());
      }
    }
  }, []);

  useEffect(() => {
    void refresh();

    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [refresh, intervalMs]);

  return { report, error, checkedAt, refreshing, refresh };
}
